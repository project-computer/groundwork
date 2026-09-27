package service

import (
	"context"

	"github.com/vet-clinic/api/internal/models"
	"github.com/vet-clinic/api/internal/repository"
)

type DashboardService struct {
	repo *repository.DashboardRepository
}

func NewDashboardService(repo *repository.DashboardRepository) *DashboardService {
	return &DashboardService{repo: repo}
}

func (s *DashboardService) GetStats(ctx context.Context, clinicID int) (*models.DashboardStats, error) {
	return s.repo.GetStats(ctx, clinicID)
}

func (s *DashboardService) GetRevenue(ctx context.Context, clinicID, months int) ([]models.RevenueEntry, error) {
	if months < 1 || months > 24 {
		months = 6
	}
	return s.repo.GetRevenue(ctx, clinicID, months)
}
