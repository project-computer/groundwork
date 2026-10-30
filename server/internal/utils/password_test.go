package utils

import "testing"

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := HashPassword("admin123")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if err := CheckPassword("admin123", hash); err != nil {
		t.Fatalf("CheckPassword valid failed: %v", err)
	}
	if err := CheckPassword("wrong", hash); err == nil {
		t.Fatal("CheckPassword should fail for wrong password")
	}
}
