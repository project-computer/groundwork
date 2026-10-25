package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const defaultClinicID = "clinic-01"

// Client talks to the cloud sync API (backend/).
type Client struct {
	BaseURL  string
	Token    string
	ClinicID string
	HTTP     *http.Client
}

func NewClient(baseURL, token string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Token:   token,
		HTTP:    &http.Client{Timeout: 20 * time.Second},
	}
}

func (c *Client) endpoint(path string) string {
	return c.BaseURL + "/api/v1/sync" + path
}

func (c *Client) do(ctx context.Context, req *http.Request, out any) error {
	req = req.WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Clinic-ID", c.clinicID())
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("sync %s failed: %s: %s", req.URL.Path, resp.Status, strings.TrimSpace(string(body)))
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("decode sync response: %w", err)
	}
	return nil
}

func (c *Client) clinicID() string {
	if c.ClinicID != "" {
		return c.ClinicID
	}
	return defaultClinicID
}

func (c *Client) Push(ctx context.Context, changes []RemoteChange) (*PushResponse, error) {
	body, err := json.Marshal(PushRequest{Changes: changes})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, c.endpoint("/push"), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	var out PushResponse
	if err := c.do(ctx, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) Pull(ctx context.Context, since int64) (*PullResponse, error) {
	query := url.Values{}
	query.Set("since", strconv.FormatInt(since, 10))
	req, err := http.NewRequest(http.MethodGet, c.endpoint("/pull")+"?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}
	var out PullResponse
	if err := c.do(ctx, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
