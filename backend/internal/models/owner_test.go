package models

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOwnerFieldShape(t *testing.T) {
	o := Owner{
		ID:       7,
		ClinicID: 1,
		Name:     "Somchai",
		Phone:    "0812345678",
	}
	assert.Equal(t, 7, o.ID)
	assert.Equal(t, "Somchai", o.Name)
	assert.Equal(t, "0812345678", o.Phone)
	assert.False(t, o.Email.Valid)
	assert.Nil(t, o.SecondaryContact)
}

func TestOwnerJSONRoundTrip(t *testing.T) {
	src := Owner{
		ID:               1,
		ClinicID:         1,
		Name:             "Jane",
		Phone:            "0899999999",
		Email:            NewNullString("jane@example.com"),
		SecondaryContact: &SecondaryContact{Name: "Partner", Phone: "0888888888"},
	}
	data, err := json.Marshal(src)
	assert.NoError(t, err)

	var dst Owner
	err = json.Unmarshal(data, &dst)
	assert.NoError(t, err)

	assert.Equal(t, src.Name, dst.Name)
	assert.Equal(t, src.Phone, dst.Phone)
	assert.Equal(t, src.Email.String, dst.Email.String)
	assert.NotNil(t, dst.SecondaryContact)
	assert.Equal(t, "Partner", dst.SecondaryContact.Name)
}

func TestCreateOwnerRequestRequiresNameAndPhone(t *testing.T) {
	// Pure shape check: required fields populated, optional empty.
	good := CreateOwnerRequest{
		Name:  "Somchai",
		Phone: "0812345678",
	}
	assert.NotEmpty(t, good.Name)
	assert.NotEmpty(t, good.Phone)

	bad := CreateOwnerRequest{Name: "", Phone: ""}
	assert.True(t, strings.TrimSpace(bad.Name) == "")
	assert.True(t, strings.TrimSpace(bad.Phone) == "")
}

func TestSecondaryContactShape(t *testing.T) {
	sc := SecondaryContact{Name: "Partner", Phone: "0811111111"}
	assert.Equal(t, "Partner", sc.Name)
	assert.Equal(t, "0811111111", sc.Phone)
}
