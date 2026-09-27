package utils

import (
	"testing"
	"time"
)

func TestGenerateAndValidateToken(t *testing.T) {
	secret := "test-secret"
	token, err := GenerateToken(1, "admin@happypaws.vet", "admin", secret, 15*time.Minute)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}
	claims, err := ValidateToken(token, secret)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}
	if claims.UserID != 1 || claims.Email != "admin@happypaws.vet" || claims.Role != "admin" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
	if _, err := ValidateToken(token, "wrong-secret"); err == nil {
		t.Fatal("ValidateToken should fail with wrong secret")
	}
}
