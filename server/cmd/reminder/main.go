package main

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/project-computer/groundwork/server/internal/config"
	"github.com/project-computer/groundwork/server/internal/repository"
	"github.com/project-computer/groundwork/server/internal/service"
)

// reminder is the standalone scheduler binary (slice 0011): it wraps
// ReminderService.RunOnce on a daily timer at 08:00 Asia/Bangkok, deployed as its
// own container alongside the API.
func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	db, err := pgxpool.New(context.Background(), cfg.Database.URL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	notifRepo := repository.NewNotificationRepository(db)
	sender := service.NewNotificationService(notifRepo, nil, notifRepo, nil)
	reminders := service.NewReminderService(notifRepo, sender)

	bangkok, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		log.Fatalf("Failed to load timezone: %v", err)
	}

	log.Println("Reminder scheduler started (daily at 08:00 Asia/Bangkok)")
	for {
		now := time.Now().In(bangkok)
		next := time.Date(now.Year(), now.Month(), now.Day(), 8, 0, 0, 0, bangkok)
		if !next.After(now) {
			next = next.AddDate(0, 0, 1)
		}
		log.Printf("Next run at %s", next)
		time.Sleep(time.Until(next))

		dispatched, err := reminders.RunOnce(context.Background(), 1)
		if err != nil {
			log.Printf("Reminder run failed: %v", err)
			continue
		}
		log.Printf("Reminder run dispatched %d reminders", dispatched)
	}
}
