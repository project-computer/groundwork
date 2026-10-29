package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Database    DatabaseConfig
	Server      ServerConfig
	JWT         JWTConfig
	CORS        CORSConfig
	FileStorage FileStorageConfig
	Env         string
}

type DatabaseConfig struct {
	URL string
}

type ServerConfig struct {
	Port string
	Host string
}

type JWTConfig struct {
	Secret        string
	AccessExpiry  time.Duration
	RefreshExpiry time.Duration
}

type CORSConfig struct {
	Origins []string
}

type FileStorageConfig struct {
	Type         string // "local" or "s3"
	UploadPath   string
	MaxSize      int64
	AWSBucket    string
	AWSRegion    string
	AWSAccessKey string
	AWSSecretKey string
}

func Load() (*Config, error) {
	viper.SetConfigName(".env")
	viper.SetConfigType("env")
	viper.AddConfigPath(".")
	viper.AddConfigPath("..")
	viper.AddConfigPath("../..")

	// Set defaults
	viper.SetDefault("PORT", "8080")
	viper.SetDefault("HOST", "0.0.0.0")
	viper.SetDefault("ENV", "development")
	viper.SetDefault("JWT_ACCESS_EXPIRY", "15m")
	viper.SetDefault("JWT_REFRESH_EXPIRY", "168h")
	viper.SetDefault("CORS_ORIGINS", "http://localhost:5173")
	viper.SetDefault("FILE_STORAGE_TYPE", "local")
	viper.SetDefault("FILE_UPLOAD_PATH", "./uploads")
	viper.SetDefault("FILE_MAX_SIZE", 10485760) // 10MB

	// Allow environment variables
	viper.AutomaticEnv()

	// Read config file (optional)
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("failed to read config: %w", err)
		}
		// Config file not found; using defaults and env vars
	}

	// Parse durations
	accessExpiry, err := time.ParseDuration(viper.GetString("JWT_ACCESS_EXPIRY"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_EXPIRY: %w", err)
	}

	refreshExpiry, err := time.ParseDuration(viper.GetString("JWT_REFRESH_EXPIRY"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_EXPIRY: %w", err)
	}

	config := &Config{
		Database: DatabaseConfig{
			URL: viper.GetString("DATABASE_URL"),
		},
		Server: ServerConfig{
			Port: viper.GetString("PORT"),
			Host: viper.GetString("HOST"),
		},
		JWT: JWTConfig{
			Secret:        viper.GetString("JWT_SECRET"),
			AccessExpiry:  accessExpiry,
			RefreshExpiry: refreshExpiry,
		},
		CORS: CORSConfig{
			Origins: viper.GetStringSlice("CORS_ORIGINS"),
		},
		FileStorage: FileStorageConfig{
			Type:         viper.GetString("FILE_STORAGE_TYPE"),
			UploadPath:   viper.GetString("FILE_UPLOAD_PATH"),
			MaxSize:      viper.GetInt64("FILE_MAX_SIZE"),
			AWSBucket:    viper.GetString("AWS_BUCKET"),
			AWSRegion:    viper.GetString("AWS_REGION"),
			AWSAccessKey: viper.GetString("AWS_ACCESS_KEY_ID"),
			AWSSecretKey: viper.GetString("AWS_SECRET_ACCESS_KEY"),
		},
		Env: viper.GetString("ENV"),
	}

	// Validate required fields
	if config.Database.URL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if config.JWT.Secret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	return config, nil
}
