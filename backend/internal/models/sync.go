package models

import "encoding/json"

// SyncChange is one entity change travelling between a desktop sidecar and the
// cloud. Payload is an envelope: {"entity": {...}, "parentId": "..."}.
type SyncChange struct {
	EntityType string          `json:"entityType" validate:"required"`
	EntityID   string          `json:"entityId" validate:"required"`
	Operation  string          `json:"operation" validate:"required,oneof=upsert append delete"`
	Payload    json.RawMessage `json:"payload,omitempty"`
	OccurredAt string          `json:"occurredAt" validate:"required"`
	Version    int64           `json:"version,omitempty"`
}

type SyncPushRequest struct {
	Changes []SyncChange `json:"changes" validate:"required,min=1,max=500,dive"`
}

type SyncPushResult struct {
	EntityType string          `json:"entityType"`
	EntityID   string          `json:"entityId"`
	Operation  string          `json:"operation"`
	OccurredAt string          `json:"occurredAt"`
	Status     string          `json:"status"`
	Version    int64           `json:"version"`
	Payload    json.RawMessage `json:"payload,omitempty"`
}

type SyncPushResponse struct {
	Results []SyncPushResult `json:"results"`
}

type SyncPullResponse struct {
	Changes       []SyncChange `json:"changes"`
	LatestVersion int64        `json:"latestVersion"`
	FullResync    bool         `json:"fullResync"`
}
