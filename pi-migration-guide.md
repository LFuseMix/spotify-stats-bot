# Raspberry Pi 5 Migration Guide

## Prerequisites
- Raspberry Pi 5 (8GB RAM recommended)
- Quality MicroSD card (64GB+, Class 10 or better)
- Ethernet cable
- SSH enabled on Pi

## Step 1: Prepare Raspberry Pi 5

### Install Raspberry Pi OS
```bash
# Flash Raspberry Pi OS Lite (64-bit) to SD card
# Enable SSH in raspi-config
sudo raspi-config
# Enable SSH, expand filesystem, set GPU memory to 16MB
```

### Initial Pi Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (recommended for your bot)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install essential packages
sudo apt install -y git sqlite3 htop nano screen

# Verify installations
node --version  # Should be 18+
npm --version
sqlite3 --version
```

## Step 2: Transfer Your Project

### From Your Arch System
```bash
# Create a tarball excluding node_modules and large logs
cd /home/lfusarch
tar --exclude='spotify-stats-bot/node_modules' \
    --exclude='spotify-stats-bot/.git' \
    --exclude='spotify-stats-bot/logs/*.log' \
    -czf spotify-bot-backup.tar.gz spotify-stats-bot/

# Transfer to Pi (replace PI_IP with actual IP)
scp spotify-bot-backup.tar.gz pi@PI_IP:/home/pi/
```

### On the Raspberry Pi
```bash
# Extract the project
cd /home/pi
tar -xzf spotify-bot-backup.tar.gz
cd spotify-stats-bot

# Install dependencies
npm install

# Copy your config.json (create if needed)
# Make sure it has your Discord/Spotify credentials
```

## Step 3: Database Migration

### Current Database Analysis
Your database files:
- `spotify_stats.db` (38MB) - Main database
- `spotify_stats.db-shm` (32KB) - Shared memory file  
- `spotify_stats.db-wal` (206KB) - Write-ahead log

### Migration Steps
```bash
# On your Arch system, stop the bot first
# Kill the node process

# Wait for WAL to be checkpointed
sqlite3 spotify_stats.db "PRAGMA wal_checkpoint(FULL);"

# Create a clean backup
sqlite3 spotify_stats.db ".backup spotify_stats_clean.db"

# Transfer the clean database
scp spotify_stats_clean.db pi@PI_IP:/home/pi/spotify-stats-bot/spotify_stats.db
```

## Step 4: Configure for Pi Environment

### Environment Setup
```bash
# On the Pi, create/update config.json
nano config.json

# Ensure all paths are correct for Pi environment
# Update any absolute paths to relative paths
```

### Performance Optimizations for Pi
```bash
# Add to your package.json scripts:
# "start": "node --max-old-space-size=512 index.js"

# For SQLite optimization, add to your database init:
# PRAGMA journal_mode=WAL;
# PRAGMA synchronous=NORMAL;
# PRAGMA cache_size=10000;
# PRAGMA temp_store=MEMORY;
```

## Step 5: Service Setup (Auto-start)

### Create Systemd Service
```bash
sudo nano /etc/systemd/system/spotify-bot.service
```

```ini
[Unit]
Description=Spotify Stats Discord Bot
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/spotify-stats-bot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Enable and Start
```bash
sudo systemctl daemon-reload
sudo systemctl enable spotify-bot
sudo systemctl start spotify-bot
sudo systemctl status spotify-bot
```

## Step 6: Monitoring & Maintenance

### Useful Commands
```bash
# Check bot status
sudo systemctl status spotify-bot

# View logs
journalctl -u spotify-bot -f

# Monitor resources
htop

# Check database size
ls -lh spotify_stats.db*

# Backup database (run weekly)
sqlite3 spotify_stats.db ".backup backup_$(date +%Y%m%d).db"
```

### Performance Monitoring
```bash
# Check memory usage
free -h

# Check disk usage  
df -h

# Check CPU temperature
vcgencmd measure_temp
```

## Expected Performance

### Resource Usage on Pi 5
- **RAM**: ~150-200MB (your current 140MB + system overhead)
- **CPU**: <5% during normal operation
- **Storage**: 121MB project + logs + backups
- **Network**: Minimal (Discord API + Spotify API calls)

### Database Performance
- **SQLite on Pi 5**: Can handle 100+ concurrent reads easily
- **Your 38MB database**: Will load in <1 second
- **Backup time**: ~1-2 seconds for full database backup

## Recommendations

1. **Use 8GB Pi 5 model** - Future-proofing for growth
2. **Quality SD card** - Samsung EVO Select or SanDisk Extreme
3. **Consider NVMe HAT** - If you plan to scale significantly
4. **UPS backup** - Small UPS for power reliability
5. **Monitor temperatures** - Ensure good ventilation

## Rollback Plan

If issues arise:
1. Keep your Arch system running initially
2. Test Pi setup thoroughly with test Discord server
3. Switch DNS/routing only when confident
4. Keep database backups on both systems

## Cost Analysis

**One-time costs:**
- Raspberry Pi 5 8GB: $80
- Quality SD card: $15
- Case + cooling: $20
- **Total: ~$115**

**Monthly savings:**
- Electricity: $20-40/month saved
- **ROI**: 3-6 months 