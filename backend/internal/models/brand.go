package models

import "time"

type BrandSettings struct {
	ID                  int       `json:"id"`
	ClinicID            int       `json:"clinicId"`
	PrimaryColor        string    `json:"primaryColor"`
	PrimaryForeground   string    `json:"primaryForeground"`
	AccentColor         string    `json:"accentColor"`
	AccentForeground    string    `json:"accentForeground"`
	SecondaryColor      string    `json:"secondaryColor"`
	SecondaryForeground string    `json:"secondaryForeground"`
	SidebarColor        string    `json:"sidebarColor"`
	SidebarForeground   string    `json:"sidebarForeground"`
	SidebarPrimary      string    `json:"sidebarPrimary"`
	SidebarAccent       string    `json:"sidebarAccent"`
	Chart1              string    `json:"chart1"`
	Chart2              string    `json:"chart2"`
	Chart3              string    `json:"chart3"`
	Chart4              string    `json:"chart4"`
	Chart5              string    `json:"chart5"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type UpdateBrandSettingsRequest struct {
	PrimaryColor        *string `json:"primaryColor"`
	PrimaryForeground   *string `json:"primaryForeground"`
	AccentColor         *string `json:"accentColor"`
	AccentForeground    *string `json:"accentForeground"`
	SecondaryColor      *string `json:"secondaryColor"`
	SecondaryForeground *string `json:"secondaryForeground"`
	SidebarColor        *string `json:"sidebarColor"`
	SidebarForeground   *string `json:"sidebarForeground"`
	SidebarPrimary      *string `json:"sidebarPrimary"`
	SidebarAccent       *string `json:"sidebarAccent"`
	Chart1              *string `json:"chart1"`
	Chart2              *string `json:"chart2"`
	Chart3              *string `json:"chart3"`
	Chart4              *string `json:"chart4"`
	Chart5              *string `json:"chart5"`
}
