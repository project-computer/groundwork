package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

// NullString wraps sql.NullString to marshal JSON as null or string
type NullString struct {
	sql.NullString
}

func (ns NullString) MarshalJSON() ([]byte, error) {
	if !ns.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(ns.String)
}

func (ns *NullString) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		ns.NullString.String = ""
		ns.NullString.Valid = false
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	ns.NullString.String = s
	ns.NullString.Valid = true
	return nil
}

// NullFloat64 wraps sql.NullFloat64 to marshal JSON as null or number
type NullFloat64 struct {
	sql.NullFloat64
}

func (nf NullFloat64) MarshalJSON() ([]byte, error) {
	if !nf.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(nf.Float64)
}

func (nf *NullFloat64) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		nf.NullFloat64.Float64 = 0
		nf.NullFloat64.Valid = false
		return nil
	}
	var f float64
	if err := json.Unmarshal(data, &f); err != nil {
		return err
	}
	nf.NullFloat64.Float64 = f
	nf.NullFloat64.Valid = true
	return nil
}

// NullTime wraps sql.NullTime to marshal JSON as null or RFC3339 string
type NullTime struct {
	sql.NullTime
}

func (nt NullTime) MarshalJSON() ([]byte, error) {
	if !nt.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(nt.Time)
}

func (nt *NullTime) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		nt.NullTime.Valid = false
		return nil
	}
	var t string
	if err := json.Unmarshal(data, &t); err != nil {
		return err
	}
	parsed, err := time.Parse(time.RFC3339, t)
	if err != nil {
		return err
	}
	nt.NullTime.Time = parsed
	nt.NullTime.Valid = true
	return nil
}

// NullInt32 wraps sql.NullInt32 to marshal JSON as null or number
type NullInt32 struct {
	sql.NullInt32
}

func (ni NullInt32) MarshalJSON() ([]byte, error) {
	if !ni.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(ni.Int32)
}

func (ni *NullInt32) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		ni.NullInt32.Int32 = 0
		ni.NullInt32.Valid = false
		return nil
	}
	var i int32
	if err := json.Unmarshal(data, &i); err != nil {
		return err
	}
	ni.NullInt32.Int32 = i
	ni.NullInt32.Valid = true
	return nil
}

// Helper constructors for null types
func NewNullString(s string) NullString {
	return NullString{sql.NullString{String: s, Valid: true}}
}

func NullStringPtr(s *string) NullString {
	if s == nil {
		return NullString{sql.NullString{Valid: false}}
	}
	return NullString{sql.NullString{String: *s, Valid: true}}
}

func NewNullFloat64(f float64) NullFloat64 {
	return NullFloat64{sql.NullFloat64{Float64: f, Valid: true}}
}

func NewNullInt32(i int32) NullInt32 {
	return NullInt32{sql.NullInt32{Int32: i, Valid: true}}
}

func NewNullTime(t time.Time) NullTime {
	return NullTime{sql.NullTime{Time: t, Valid: true}}
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type PaginationMeta struct {
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	TotalItems int `json:"totalItems"`
	TotalPages int `json:"totalPages"`
}

type PaginatedResponse struct {
	Data interface{}    `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

type DashboardStats struct {
	TodayAppointments      int                        `json:"todayAppointments"`
	PendingVisits          int                        `json:"pendingVisits"`
	TodayRevenue           float64                    `json:"todayRevenue"`
	WeekRevenue            float64                    `json:"weekRevenue"`
	MonthRevenue           float64                    `json:"monthRevenue"`
	ActivePatients         int                        `json:"activePatients"`
	UpcomingVaccinations   []DashboardVaccinationItem `json:"upcomingVaccinations,omitempty"`
	OverdueVaccinations    []DashboardVaccinationItem `json:"overdueVaccinations,omitempty"`
	LowStockItems          []DashboardLowStockItem    `json:"lowStockItems,omitempty"`
	ExpiringLots           []DashboardExpiringLot     `json:"expiringLots,omitempty"`
	MostUsedMedicines      []DashboardMostUsedItem    `json:"mostUsedMedicines,omitempty"`
}

// DashboardLowStockItem is one row of the "Low Stock" widget (slice 0009).
// On-hand is the SUM of active lots; low means on_hand <= reorder_level > 0.
type DashboardLowStockItem struct {
	ItemID       int    `json:"itemId"`
	Name         string `json:"name"`
	Category     string `json:"category"`
	OnHand       int    `json:"onHand"`
	ReorderLevel int    `json:"reorderLevel"`
	Link         string `json:"link"`
}

// DashboardExpiringLot is one row of the "Expiring Soon" widget (slice 0009).
type DashboardExpiringLot struct {
	LotID     int    `json:"lotId"`
	ItemID    int    `json:"itemId"`
	ItemName  string `json:"itemName"`
	LotNumber string `json:"lotNumber"`
	ExpiryDate string `json:"expiryDate"`
	Quantity  int    `json:"quantity"`
	Link      string `json:"link"`
}

// DashboardMostUsedItem is one row of the "Top Used Medicines" widget (slice 0009).
// Source of truth is stock_movements stock_out rows — NOT prescriptions JSON.
type DashboardMostUsedItem struct {
	ItemID  int    `json:"itemId"`
	Name    string `json:"name"`
	UsedQty int    `json:"usedQty"`
	Link    string `json:"link"`
}

// DashboardVaccinationItem is one row of the dashboard's "Vaccinations Due" widget.
// Source of truth for due-date is vaccinations.next_due_date per slice 0006.
type DashboardVaccinationItem struct {
	ID            int    `json:"id"`
	PatientID     int    `json:"patientId"`
	PatientName   string `json:"patientName"`
	VaccineName   string `json:"vaccineName"`
	NextDueDate   string `json:"nextDueDate"`
	Link          string `json:"link"`
}

// DashboardRevenueEntry is one (Month, Revenue) row in the dashboard's revenue series.
// The JSON shape mirrors the previous in-handler type so the frontend is unaffected.
type DashboardRevenueEntry struct {
	Month   string  `json:"month"`
	Revenue float64 `json:"revenue"`
}
