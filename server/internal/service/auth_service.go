package service

import (
	"context"
	"errors"
	"time"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
	"github.com/vet-clinic/api/internal/utils"
)

type AuthService struct {
	userRepo      *repository.UserRepository
	jwtSecret     string
	accessExpiry  time.Duration
	refreshExpiry time.Duration
}

func NewAuthService(userRepo *repository.UserRepository, jwtSecret string, accessExpiry, refreshExpiry time.Duration) *AuthService {
	return &AuthService{
		userRepo:      userRepo,
		jwtSecret:     jwtSecret,
		accessExpiry:  accessExpiry,
		refreshExpiry: refreshExpiry,
	}
}

func (s *AuthService) Login(ctx context.Context, req models.LoginRequest) (*models.LoginResponse, error) {
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	if !user.IsActive {
		return nil, errors.New("account is inactive")
	}

	if err := utils.CheckPassword(req.Password, user.PasswordHash); err != nil {
		return nil, errors.New("invalid credentials")
	}

	accessToken, err := utils.GenerateToken(user.ID, user.ClinicID, user.Email, user.Role, s.jwtSecret, s.accessExpiry)
	if err != nil {
		return nil, err
	}

	refreshToken, err := utils.GenerateToken(user.ID, user.ClinicID, user.Email, user.Role, s.jwtSecret, s.refreshExpiry)
	if err != nil {
		return nil, err
	}

	return &models.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         *user,
	}, nil
}

func (s *AuthService) RefreshToken(ctx context.Context, refreshToken string) (*models.LoginResponse, error) {
	claims, err := utils.ValidateToken(refreshToken, s.jwtSecret)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}

	user, err := s.userRepo.GetByID(ctx, claims.UserID)
	if err != nil {
		return nil, errors.New("user not found")
	}

	if !user.IsActive {
		return nil, errors.New("account is inactive")
	}

	newAccessToken, err := utils.GenerateToken(user.ID, user.ClinicID, user.Email, user.Role, s.jwtSecret, s.accessExpiry)
	if err != nil {
		return nil, err
	}

	newRefreshToken, err := utils.GenerateToken(user.ID, user.ClinicID, user.Email, user.Role, s.jwtSecret, s.refreshExpiry)
	if err != nil {
		return nil, err
	}

	return &models.LoginResponse{
		AccessToken:  newAccessToken,
		RefreshToken: newRefreshToken,
		User:         *user,
	}, nil
}

func (s *AuthService) CreateUser(ctx context.Context, req models.CreateUserRequest) (*models.User, error) {
	// Check if user already exists
	existingUser, _ := s.userRepo.GetByEmail(ctx, req.Email)
	if existingUser != nil {
		return nil, errors.New("user with this email already exists")
	}

	// Hash password
	passwordHash, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	user := &models.User{
		Email:        req.Email,
		PasswordHash: passwordHash,
		Name:         req.Name,
		Role:         req.Role,
		IsActive:     true,
	}
	if req.Phone != "" {
		user.Phone.String = req.Phone
		user.Phone.Valid = true
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *AuthService) GetUser(ctx context.Context, id int) (*models.User, error) {
	return s.userRepo.GetByID(ctx, id)
}

func (s *AuthService) ListUsers(ctx context.Context) ([]*models.User, error) {
	return s.userRepo.List(ctx)
}

func (s *AuthService) UpdateUser(ctx context.Context, id int, req models.UpdateUserRequest) error {
	updates := make(map[string]interface{})
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Phone != "" {
		updates["phone"] = req.Phone
	}
	if req.AvatarURL != "" {
		updates["avatar_url"] = req.AvatarURL
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	return s.userRepo.Update(ctx, id, updates)
}

func (s *AuthService) ChangePassword(ctx context.Context, userID int, req models.ChangePasswordRequest) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	if err := utils.CheckPassword(req.OldPassword, user.PasswordHash); err != nil {
		return errors.New("invalid old password")
	}

	newPasswordHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		return err
	}

	return s.userRepo.UpdatePassword(ctx, userID, newPasswordHash)
}
