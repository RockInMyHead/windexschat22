#!/bin/bash

# WindexsAI Chat - Production Deployment Script
# Usage: ./deploy.sh [environment]
# Environment: production (default), staging, development

set -e

ENVIRONMENT=${1:-production}
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

echo "🚀 Starting WindexsAI Chat deployment for $ENVIRONMENT environment"
echo "📁 Project root: $PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required files exist
check_requirements() {
    print_status "Checking requirements..."

    if [ ! -f ".env" ]; then
        print_error ".env file not found!"
        print_error "Please create .env file with required environment variables"
        exit 1
    fi

    if [ ! -f "package.json" ]; then
        print_error "package.json not found!"
        exit 1
    fi

    if [ ! -f "server.js" ]; then
        print_error "server.js not found!"
        exit 1
    fi

    print_success "Requirements check passed"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."

    if [ "$ENVIRONMENT" = "production" ]; then
        npm ci --only=production
    else
        npm install
    fi

    print_success "Dependencies installed"
}

# Initialize database
init_database() {
    print_status "Initializing database..."

    if [ ! -f "windexs_chat.db" ]; then
        npm run init-db
        print_success "Database initialized"
    else
        print_warning "Database already exists, skipping initialization"
    fi
}

# Build frontend
build_frontend() {
    print_status "Building frontend for $ENVIRONMENT..."

    if [ "$ENVIRONMENT" = "production" ]; then
        npm run build
    else
        npm run build:dev
    fi

    if [ ! -d "dist" ]; then
        print_error "Build failed - dist directory not found!"
        exit 1
    fi

    print_success "Frontend built successfully"
}

# Create production environment file
create_env_file() {
    print_status "Creating $ENVIRONMENT environment configuration..."

    ENV_FILE="$DEPLOY_DIR/.env.$ENVIRONMENT"

    # Copy base .env
    cp .env "$ENV_FILE"

    # Add production-specific settings
    cat >> "$ENV_FILE" << EOF

# Production Configuration
NODE_ENV=$ENVIRONMENT
PORT=80

# API Base URL for frontend
VITE_API_BASE_URL=/api

# Logging
LOG_LEVEL=info

# Performance
MAX_WORKERS=4
EOF

    print_success "Environment file created: $ENV_FILE"
}

# Create deployment directory structure
create_deploy_structure() {
    print_status "Creating deployment structure..."

    # Clean previous deploy
    rm -rf "$DEPLOY_DIR"
    mkdir -p "$DEPLOY_DIR"

    # Copy required files
    cp -r dist "$DEPLOY_DIR/"
    cp server.js "$DEPLOY_DIR/"
    cp windexs_chat.db "$DEPLOY_DIR/" 2>/dev/null || print_warning "Database file not found, will be created on first run"

    # Copy package files
    cp package.json "$DEPLOY_DIR/"
    cp package-lock.json "$DEPLOY_DIR/" 2>/dev/null || true

    # Copy environment file
    cp ".env.$ENVIRONMENT" "$DEPLOY_DIR/.env" 2>/dev/null || cp .env "$DEPLOY_DIR/.env"

    print_success "Deployment structure created in $DEPLOY_DIR"
}

# Create PM2 ecosystem file
create_pm2_config() {
    print_status "Creating PM2 configuration..."

    cat > "$DEPLOY_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: 'windexs-ai-$ENVIRONMENT',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: '$ENVIRONMENT',
      PORT: 80
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

    print_success "PM2 configuration created"
}

# Create deployment info
create_deploy_info() {
    print_status "Creating deployment information..."

    DEPLOY_INFO="$DEPLOY_DIR/DEPLOY_INFO.txt"

    cat > "$DEPLOY_INFO" << EOF
WindexsAI Chat - Deployment Information
=====================================

Environment: $ENVIRONMENT
Deployed at: $(date)
Version: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')

Deployment Structure:
├── dist/                 # Frontend build files
├── server.js            # Express server
├── windexs_chat.db      # SQLite database
├── .env                 # Environment variables
├── package.json         # Dependencies
├── ecosystem.config.js  # PM2 configuration
└── DEPLOY_INFO.txt      # This file

Startup Commands:
1. cd $DEPLOY_DIR
2. npm install --production
3. pm2 start ecosystem.config.js
4. pm2 save
5. pm2 startup

Check Status:
- pm2 status
- pm2 logs windexs-ai-$ENVIRONMENT

Health Check:
- curl http://localhost/api/health
- curl http://localhost/

Logs Location:
- $DEPLOY_DIR/logs/

Database Location:
- $DEPLOY_DIR/windexs_chat.db

Environment Variables:
$(cat "$DEPLOY_DIR/.env" | grep -E '^[A-Z_]+=' | sed 's/=.*//' | sed 's/^/- /')
EOF

    print_success "Deployment info created: $DEPLOY_INFO"
}

# Create backup script
create_backup_script() {
    print_status "Creating backup script..."

    cat > "$DEPLOY_DIR/backup.sh" << 'EOF'
#!/bin/bash

# WindexsAI Chat - Database Backup Script

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/windexs_chat_$DATE.db"

mkdir -p "$BACKUP_DIR"

if [ -f "windexs_chat.db" ]; then
    cp windexs_chat.db "$BACKUP_FILE"
    echo "✅ Database backed up: $BACKUP_FILE"

    # Keep only last 10 backups
    cd "$BACKUP_DIR" && ls -t *.db | tail -n +11 | xargs -r rm
    echo "🧹 Old backups cleaned up"
else
    echo "❌ Database file not found!"
    exit 1
fi
EOF

    chmod +x "$DEPLOY_DIR/backup.sh"
    print_success "Backup script created"
}

# Main deployment process
main() {
    echo "🎯 WindexsAI Chat Deployment Script"
    echo "=================================="
    echo ""

    check_requirements
    install_dependencies
    init_database
    build_frontend
    create_env_file
    create_deploy_structure
    create_pm2_config
    create_deploy_info
    create_backup_script

    echo ""
    print_success "🎉 Deployment package ready!"
    echo ""
    echo "📦 Deployment directory: $DEPLOY_DIR"
    echo ""
    echo "🚀 To deploy on server:"
    echo "   1. Copy $DEPLOY_DIR to your server"
    echo "   2. Run: cd $DEPLOY_DIR && npm install --production"
    echo "   3. Run: pm2 start ecosystem.config.js"
    echo "   4. Run: pm2 save && pm2 startup"
    echo ""
    echo "🔍 Check deployment info: $DEPLOY_DIR/DEPLOY_INFO.txt"
    echo ""
    echo "📊 Monitor with: pm2 monit"
}

# Run main function
main "$@"