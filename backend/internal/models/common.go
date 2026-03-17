package models

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
	TodayAppointments int     `json:"todayAppointments"`
	PendingVisits     int     `json:"pendingVisits"`
	TodayRevenue      float64 `json:"todayRevenue"`
	WeekRevenue       float64 `json:"weekRevenue"`
	MonthRevenue      float64 `json:"monthRevenue"`
	ActivePatients    int     `json:"activePatients"`
}
