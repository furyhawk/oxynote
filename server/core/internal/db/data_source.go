package db

import (
	"context"

	sq "github.com/Masterminds/squirrel"
	"github.com/jmoiron/sqlx"
	"github.com/oxynote/oxynote/server/core/internal/datasource"
	"github.com/oxynote/oxynote/server/core/internal/datasource/processor"
	"github.com/rs/xid"
)

// InsertDataSource inserts a data source into the database.
func (a *agent) InsertDataSource(ctx context.Context, ds *datasource.DataSource) error {
	safeCredentials, err := ds.Credentials.Encrypt(a.opts.DataSourceCredentialsKeys, ds.ID.Bytes())
	if err != nil {
		return err
	}

	q, args := a.builder.Insert("data_sources").
		SetMap(map[string]any{
			"id":                 ds.ID,
			"fk_organization_id": ds.OrganizationID,
			"name":               ds.Name,
			"type":               ds.Type,
			"url":                ds.URL,
			"credentials":        safeCredentials,
			"status":             ds.Status,
			"created_at":         ds.CreatedAt,
			"updated_at":         ds.UpdatedAt,
		}).
		MustSql()

	_, err = a.sql.ExecContext(ctx, q, args...)

	return err
}

// UpdateDataSource updates an existing data source in the database.
func (a *agent) UpdateDataSource(ctx context.Context, ds *datasource.DataSource) error {
	safeCredentials, err := ds.Credentials.Encrypt(a.opts.DataSourceCredentialsKeys, ds.ID.Bytes())
	if err != nil {
		return err
	}

	q, args := a.builder.Update("data_sources").
		SetMap(map[string]any{
			"name":        ds.Name,
			"url":         ds.URL,
			"credentials": safeCredentials,
			"status":      ds.Status,
			"updated_at":  ds.UpdatedAt,
		}).
		Where(sq.Eq{
			"id":                 ds.ID,
			"fk_organization_id": ds.OrganizationID,
		}).
		MustSql()

	_, err = a.sql.ExecContext(ctx, q, args...)

	return err
}

// UpdateDataSourceStatus records what a data source's connection last
// reported.
//
// It writes the status alone rather than going through UpdateDataSource:
// the observation says nothing about the name, the URL or the
// credentials, and re-encrypting credentials to store it would risk the
// one field nobody asked to change.
func (a *agent) UpdateDataSourceStatus(
	ctx context.Context,
	id xid.ID,
	organizationID string,
	status processor.ConnectionStatus,
) error {
	q, args := a.builder.Update("data_sources").
		SetMap(map[string]any{
			"status": status,
		}).
		Where(sq.Eq{
			"id":                 id,
			"fk_organization_id": organizationID,
		}).
		MustSql()

	_, err := a.sql.ExecContext(ctx, q, args...)

	return err
}

// ReencryptDataSourceCredentials moves every data source's credentials onto
// the newest key and reports how many rows it rewrote and how many no key
// reads. It is what lets an operator drop a retired key: once it returns,
// nothing is sealed under any other key.
//
// It deliberately spans every organization: it belongs to boot, and no
// consumer interface lists it. Rows already on the newest key are left
// alone without being decrypted. Unreadable rows keep their ciphertext, as
// every read does, and surface through their status on first use.
func (a *agent) ReencryptDataSourceCredentials(ctx context.Context) (int, int, error) {
	keys := a.opts.DataSourceCredentialsKeys

	var moved, unreadable int

	q, args := a.builder.Select("id", "credentials").
		From("data_sources").
		MustSql()

	var rows []struct {
		ID          xid.ID `db:"id"`
		Credentials []byte `db:"credentials"`
	}

	if err := sqlx.SelectContext(ctx, a.sql, &rows, q, args...); err != nil {
		return 0, 0, err
	}

	for _, row := range rows {
		if keys.IsCurrent(row.Credentials) {
			continue
		}

		plaintext, err := keys.Decrypt(row.Credentials, row.ID.Bytes())
		if err != nil {
			unreadable++

			continue
		}

		sealed, err := keys.Encrypt(plaintext, row.ID.Bytes())
		if err != nil {
			// NOCOV: crypto/rand failures cannot be simulated in tests.
			return moved, unreadable, err
		}

		q, args := a.builder.Update("data_sources").
			SetMap(map[string]any{
				"credentials": sealed,
			}).
			Where(sq.Eq{
				"id": row.ID,
			}).
			MustSql()

		if _, err := a.sql.ExecContext(ctx, q, args...); err != nil {
			return moved, unreadable, err
		}

		moved++
	}

	return moved, unreadable, nil
}

// DeleteDataSource removes a data source from the database.
func (a *agent) DeleteDataSource(ctx context.Context, id xid.ID, organizationID string) error {
	q, args := a.builder.Delete("data_sources").
		Where(sq.Eq{
			"id":                 id,
			"fk_organization_id": organizationID,
		}).
		MustSql()

	_, err := a.sql.ExecContext(ctx, q, args...)

	return err
}

// FetchDataSource retrieves a data source by ID and organization ID.
func (a *agent) FetchDataSource(ctx context.Context, id xid.ID, organizationID string) (*datasource.DataSource, error) {
	q, args := a.selectDataSource(a.builder.Select()).
		Where(sq.Eq{
			"id":                 id,
			"fk_organization_id": organizationID,
		}).
		Limit(1).
		MustSql()

	ds := &datasource.DataSource{}
	if err := sqlx.GetContext(ctx, a.sql, ds, q, args...); err != nil {
		return nil, err
	}

	if err := ds.Credentials.Decrypt(a.opts.DataSourceCredentialsKeys, ds.ID.Bytes()); err != nil {
		if merr := a.markCredentialsUndecryptable(ctx, ds); merr != nil {
			return nil, merr
		}
	}

	return ds, nil
}

// FetchDataSources retrieves all data sources for an organization.
func (a *agent) FetchDataSources(ctx context.Context, organizationID string) ([]datasource.DataSource, error) {
	q, args := a.selectDataSource(a.builder.Select()).
		Where(sq.Eq{
			"fk_organization_id": organizationID,
		}).
		OrderBy("created_at DESC").
		MustSql()

	sources := []datasource.DataSource{}

	if err := sqlx.SelectContext(ctx, a.sql, &sources, q, args...); err != nil {
		return nil, err
	}

	for i := range sources {
		if err := sources[i].Credentials.Decrypt(a.opts.DataSourceCredentialsKeys, sources[i].ID.Bytes()); err != nil {
			if merr := a.markCredentialsUndecryptable(ctx, &sources[i]); merr != nil {
				return nil, merr
			}
		}
	}

	return sources, nil
}

// markCredentialsUndecryptable records on a data source's row that its stored
// credentials cannot be read with the configured keys. The failed Decrypt has
// already marked the credentials themselves.
//
// The ciphertext is left alone — a key restored later decrypts it again — but
// the data source travels carrying the status that says why, so a dropped
// key surfaces as one broken connection rather than as a read that fails for
// everything the organization owns.
func (a *agent) markCredentialsUndecryptable(ctx context.Context, ds *datasource.DataSource) error {
	if ds.Status == processor.ConnectionStatusInvalidEncryptionKey {
		return nil
	}

	ds.Status = processor.ConnectionStatusInvalidEncryptionKey

	return a.UpdateDataSourceStatus(ctx, ds.ID, ds.OrganizationID, ds.Status)
}

// selectDataSource prepares a SQL select statement for fetching data sources.
func (a *agent) selectDataSource(b sq.SelectBuilder) sq.SelectBuilder {
	return b.Columns(
		"id",
		"fk_organization_id",
		"name",
		"type",
		"url",
		"credentials",
		"status",
		"created_at",
		"updated_at",
	).From("data_sources")
}
