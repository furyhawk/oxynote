package mcp

import (
	"strings"

	"github.com/rs/xid"
)

// _resourceURIPrefix addresses a document in the oxynote resource
// scheme; the id after the prefix is the document's xid.
const _resourceURIPrefix = "oxynote://documents/"

// _resourceBranchSegment separates a document id from a branch id in a
// resource URI: oxynote://documents/{id}/branches/{branch_id} reads that
// branch, and every resource names one.
const _resourceBranchSegment = "/branches/"

// _resourceURITemplate is the RFC 6570 template every branch resource
// URI matches.
const _resourceURITemplate = _resourceURIPrefix + "{id}" + _resourceBranchSegment + "{branch_id}"

// resourceURI addresses one branch of a document in the resource scheme.
func resourceURI(documentID, branchID xid.ID) string {
	return _resourceURIPrefix + documentID.String() + _resourceBranchSegment + branchID.String()
}

// parseResourceURI reads back what resourceURI wrote, reporting whether
// the URI names a document branch at all.
func parseResourceURI(uri string) (documentID, branchID xid.ID, ok bool) {
	rest, ok := strings.CutPrefix(uri, _resourceURIPrefix)
	if !ok {
		return xid.NilID(), xid.NilID(), false
	}

	rawDocumentID, rawBranchID, ok := strings.Cut(rest, _resourceBranchSegment)
	if !ok {
		return xid.NilID(), xid.NilID(), false
	}

	documentID, err := xid.FromString(rawDocumentID)
	if err != nil {
		return xid.NilID(), xid.NilID(), false
	}

	branchID, err = xid.FromString(rawBranchID)
	if err != nil {
		return xid.NilID(), xid.NilID(), false
	}

	return documentID, branchID, true
}
