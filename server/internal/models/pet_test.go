package models

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPatientFieldShape(t *testing.T) {
	p := Patient{
		ID:       42,
		ClinicID: 1,
		MRN:      "PT-2026-0042",
		Name:     "Mochi",
		Species:  "Dog",
		OwnerID:  7,
		Status:   "Active",
	}
	assert.Equal(t, 42, p.ID)
	assert.Equal(t, "PT-2026-0042", p.MRN)
	assert.Equal(t, "Mochi", p.Name)
	assert.Equal(t, "Active", p.Status)
	assert.False(t, p.DeletedAt.Valid)
	assert.Equal(t, 7, p.OwnerID)
}

func TestPatientJSONRoundTrip(t *testing.T) {
	src := Patient{
		ID:       1,
		ClinicID: 1,
		MRN:      "PT-2026-0001",
		Name:     "Luna",
		Species:  "Cat",
		OwnerID:  3,
		Status:   "Active",
	}
	data, err := json.Marshal(src)
	assert.NoError(t, err)

	var dst Patient
	err = json.Unmarshal(data, &dst)
	assert.NoError(t, err)

	assert.Equal(t, src.Name, dst.Name)
	assert.Equal(t, src.MRN, dst.MRN)
	assert.Equal(t, src.OwnerID, dst.OwnerID)
	assert.Equal(t, src.Status, dst.Status)
}
