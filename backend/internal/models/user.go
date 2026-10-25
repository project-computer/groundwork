package models

import (
	"time"
)

type User struct {
	ID           int        `json:"id"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	Name         string     `json:"name"`
	Role         string     `json:"role"`
	Phone        NullString `json:"phone,omitempty"`
	AvatarURL    NullString `json:"avatarUrl,omitempty"`
	IsActive     bool       `json:"isActive"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

type CreateUserRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	Name     string `json:"name" validate:"required"`
	Role     string `json:"role" validate:"required,oneof=admin veterinarian receptionist pharmacist"`
	Phone    string `json:"phone,omitempty"`
}

type UpdateUserRequest struct {
	Name      string `json:"name,omitempty"`
	Phone     string `json:"phone,omitempty"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	IsActive  *bool  `json:"isActive,omitempty"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"oldPassword" validate:"required"`
	NewPassword string `json:"newPassword" validate:"required,min=8"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type LoginResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	User         User   `json:"user"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refreshToken" validate:"required"`
}
