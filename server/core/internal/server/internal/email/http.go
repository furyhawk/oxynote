// Package email handles internal email-sending requests.
package email

import (
	"log/slog"
	"net/http"

	emailCore "github.com/oxynote/oxynote/server/core/internal/email"
	"github.com/oxynote/oxynote/server/core/pkg/httpserver"
)

// Handler holds dependencies required for email operations.
type Handler struct {
	log    *slog.Logger
	sender Sender
}

// NewHandler creates a new email handling instance.
func NewHandler(
	log *slog.Logger,
	sender Sender,
) *Handler {
	return &Handler{
		log:    log.With("component", "email-handler"),
		sender: sender,
	}
}

// SendEmail sends an email rendered from the requested template.
func (h *Handler) SendEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Template emailCore.Template `json:"template"`
		Data     emailCore.Data     `json:"data"`
	}

	if err := httpserver.DecodeJSON(r, &req); err != nil {
		httpserver.RespondError(h.log, w, err)
		return
	}

	if err := h.sender.Send(req.Template, req.Data); err != nil {
		httpserver.RespondError(h.log, w, err)
		return
	}

	httpserver.Respond(h.log, w, nil, http.StatusNoContent)
}

// Sender is an interface that handles email sending.
//
//go:generate ../../../../scripts/codegen/mock -t internal Sender
type Sender interface {
	// Send should send the template to the recipient in the data,
	// rendered with the values it carries, reporting only a template
	// that cannot be sent.
	Send(tmpl emailCore.Template, d emailCore.Data) error
}
