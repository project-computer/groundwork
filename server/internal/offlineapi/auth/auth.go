// Package auth owns PIN hashing, session tokens and the role vocabulary.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	RoleAdmin        = "admin"
	RoleVeterinarian = "veterinarian"
	RoleReceptionist = "receptionist"
	RolePharmacist   = "pharmacist"

	// SessionTTL is the fixed session lifetime; logout is the explicit end.
	SessionTTL = 12 * time.Hour
)

var ErrInvalidPIN = errors.New("invalid PIN")

// HashPIN hashes a staff PIN with bcrypt (plan AUTH-03).
func HashPIN(pin string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPIN reports whether pin matches hash, in constant time.
func VerifyPIN(hash, pin string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(pin))
	return err == nil
}

// NewSessionToken returns the bearer token handed to the client and the
// SHA-256 hash that is stored. The raw token is never persisted.
func NewSessionToken() (token, tokenHash string, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	token = hex.EncodeToString(raw)
	return token, HashToken(token), nil
}

// HashToken hashes a bearer token for lookup.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// ConstantTimeEquals compares two strings without leaking their contents.
func ConstantTimeEquals(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// HasAnyRole reports whether roles contains at least one of want.
func HasAnyRole(roles []string, want ...string) bool {
	for _, role := range roles {
		for _, candidate := range want {
			if role == candidate {
				return true
			}
		}
	}
	return false
}

// IsKnownRole reports whether name is part of the closed role set.
func IsKnownRole(name string) bool {
	switch name {
	case RoleAdmin, RoleVeterinarian, RoleReceptionist, RolePharmacist:
		return true
	default:
		return false
	}
}

// ValidPIN checks the accepted PIN shape. Staff PINs are 4-8 ASCII digits.
func ValidPIN(pin string) bool {
	if len(pin) < 4 || len(pin) > 8 {
		return false
	}
	for _, r := range pin {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
