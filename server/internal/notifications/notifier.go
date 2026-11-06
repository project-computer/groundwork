package notifications

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strings"

	"github.com/project-computer/groundwork/server/internal/models"
)

// Notifier is the channel-adapter surface (slice 0010). Implementations send the
// message and return the provider's external ID for the NotificationLog row.
type Notifier interface {
	Channel() string
	Send(ctx context.Context, recipient, message string) (externalID string, err error)
	// Configured reports whether real credentials are present. Unconfigured
	// adapters fall back to log-only dev behavior that still writes a log row.
	Configured() bool
}

// ---------- LINE Messaging API ----------

type LineNotifier struct {
	ChannelAccessToken string
	OAID               string
	client             HTTPClient
}

// HTTPClient lets tests stub the wire call.
type HTTPClient interface {
	PostJSON(ctx context.Context, url, authToken string, body []byte) (respBody []byte, err error)
}

// defaultHTTPClient is used when no stub is injected.
type defaultHTTPClient struct{}

func (defaultHTTPClient) PostJSON(ctx context.Context, url, authToken string, body []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+authToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func NewLineNotifier(client HTTPClient) *LineNotifier {
	return &LineNotifier{
		ChannelAccessToken: os.Getenv("LINE_CHANNEL_ACCESS_TOKEN"),
		OAID:               os.Getenv("LINE_OA_ID"),
		client:             client,
	}
}

func (l *LineNotifier) Channel() string  { return "line" }
func (l *LineNotifier) Configured() bool { return l.ChannelAccessToken != "" && l.OAID != "" }

func (l *LineNotifier) Send(ctx context.Context, recipient, message string) (string, error) {
	if !l.Configured() {
		log.Printf("[notifications] DEV line send (not configured) to %s: %s", recipient, message)
		return "dev-line", nil
	}
	body := []byte(fmt.Sprintf(`{"to":%q,"messages":[{"type":"text","text":%q}]}`, recipient, message))
	client := l.client
	if client == nil {
		client = defaultHTTPClient{}
	}
	resp, err := client.PostJSON(ctx, fmt.Sprintf("https://api.line.me/v2/bot/message/push?oa=%s", l.OAID), l.ChannelAccessToken, body)
	if err != nil {
		return "", err
	}
	return extractString(resp, "messageId"), nil
}

// ---------- SMS (Twilio-compatible REST API) ----------

type SMSNotifier struct {
	APIKey     string
	FromNumber string
	client     HTTPClient
}

func NewSMSNotifier(client HTTPClient) *SMSNotifier {
	return &SMSNotifier{
		APIKey:     os.Getenv("SMS_API_KEY"),
		FromNumber: os.Getenv("SMS_FROM_NUMBER"),
		client:     client,
	}
}

func (s *SMSNotifier) Channel() string  { return "sms" }
func (s *SMSNotifier) Configured() bool { return s.APIKey != "" && s.FromNumber != "" }

func (s *SMSNotifier) Send(ctx context.Context, recipient, message string) (string, error) {
	if !s.Configured() {
		log.Printf("[notifications] DEV sms send (not configured) to %s: %s", recipient, message)
		return "dev-sms", nil
	}
	body := []byte(fmt.Sprintf(`{"to":%q,"from":%q,"text":%q}`, recipient, s.FromNumber, message))
	client := s.client
	if client == nil {
		client = defaultHTTPClient{}
	}
	resp, err := client.PostJSON(ctx, "https://api.twilio.com/2010-04-01/Messages.json", s.APIKey, body)
	if err != nil {
		return "", err
	}
	return extractString(resp, "sid"), nil
}

// ---------- Email (SMTP) ----------

type EmailNotifier struct {
	Host     string
	User     string
	Password string
	From     string
}

func NewEmailNotifier() *EmailNotifier {
	return &EmailNotifier{
		Host:     os.Getenv("SMTP_HOST"),
		User:     os.Getenv("SMTP_USER"),
		Password: os.Getenv("SMTP_PASS"),
		From:     os.Getenv("SMTP_FROM"),
	}
}

func (e *EmailNotifier) Channel() string { return "email" }
func (e *EmailNotifier) Configured() bool {
	return e.Host != "" && e.From != ""
}

func (e *EmailNotifier) Send(_ context.Context, recipient, message string) (string, error) {
	if !e.Configured() {
		log.Printf("[notifications] DEV email send (not configured) to %s: %s", recipient, message)
		return "dev-email", nil
	}
	addr := e.Host
	if !strings.Contains(addr, ":") {
		addr += ":587"
	}
	msg := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: VetClinic notification\r\n\r\n%s", e.From, recipient, message))
	auth := smtp.PlainAuth("", e.User, e.Password, strings.Split(addr, ":")[0])
	if err := smtp.SendMail(addr, auth, e.From, []string{recipient}, msg); err != nil {
		return "", err
	}
	return "smtp", nil
}

// extractString is a tiny JSON string-field extractor avoiding a dependency for one field.
func extractString(body []byte, field string) string {
	needle := `"` + field + `":"`
	i := strings.Index(string(body), needle)
	if i < 0 {
		return ""
	}
	rest := string(body[i+len(needle):])
	if j := strings.Index(rest, `"`); j >= 0 {
		return rest[:j]
	}
	return ""
}

// Adapters bundles the three channel adapters in fallback order (line → sms → email).
func Adapters() []Notifier {
	return []Notifier{NewLineNotifier(nil), NewSMSNotifier(nil), NewEmailNotifier()}
}

// Ensure the models import stays meaningful if types evolve.
var _ = models.NotificationLog{}
