package slack

import (
	"context"

	"github.com/oxynote/oxynote/server/core/internal/server/internal/auth"
	"github.com/oxynote/oxynote/server/core/pkg/httpserver"
	"github.com/oxynote/wetsocks/wsserver"
	"github.com/rs/xid"
)

// Message represents a new message.
type Message struct {
	// ID is the unique identifier for the message.
	ID xid.ID `json:"id"`
}

// BindPostMessage binds the post message callback to a WebSocket topic.
func (h *Handler) BindPostMessage(tpc wsserver.Topic) {
	h.message.postCallback = func(organizationID string, id xid.ID) {
		ctx, cancel := context.WithTimeout(context.Background(), httpserver.WSPublishTimeout)
		defer cancel()

		tpc.PublishMany(ctx, Message{ID: id}, auth.FilterOrganization(organizationID))
	}
}
