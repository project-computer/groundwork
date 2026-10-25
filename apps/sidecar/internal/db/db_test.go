package db

import "testing"

func TestOpenInMemoryAppliesAllMigrations(t *testing.T) {
	database, err := OpenInMemory()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	versions, err := AppliedVersions(database.Conn)
	if err != nil {
		t.Fatal(err)
	}
	want := []int64{1, 2, 3, 4}
	if len(versions) != len(want) {
		t.Fatalf("expected %d migrations, got %v", len(want), versions)
	}
	for i, version := range want {
		if versions[i] != version {
			t.Fatalf("expected version %d at %d, got %v", version, i, versions)
		}
	}

	var name string
	if err := database.Conn.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_meta'").Scan(&name); err != nil {
		t.Fatalf("sync_meta table missing: %v", err)
	}
}
