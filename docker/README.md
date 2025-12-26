# Sentinel Dashboard - Docker Deployment

Docker deployment configuration for Sentinel Dashboard v2.0.

## Quick Start

1. **Set environment variables** (optional):
   ```bash
   export AUTH_TOKEN=$(openssl rand -hex 32)
   export AUTH_SECRET=$(openssl rand -hex 32)
   ```

2. **Start services**:
   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Access the dashboard**:
   - Frontend: http://localhost:8080
   - Backend API: http://localhost:3010

## Services

### Backend
- **Port**: 3010
- **Image**: Built from `Dockerfile.backend`
- **Health Check**: http://localhost:3010/health

### Frontend
- **Port**: 8080 (nginx on port 80 inside container)
- **Image**: Built from `Dockerfile.frontend`
- **Health Check**: http://localhost:8080/

## Configuration

### Environment Variables

Create a `.env` file in the `docker` directory:

```env
AUTH_TOKEN=your-secure-token-here
AUTH_SECRET=your-secure-secret-here
AUTH_ENABLED=true
CORS_ORIGIN=http://localhost:8080
```

### Volumes

The backend container mounts:
- `/var/lib/fail2ban` - fail2ban database (read-only)
- `/var/log/fail2ban.log` - fail2ban log (read-only)
- `../backend/scripts` - Scripts directory (read-only)

**Note**: For production, you may need to adjust volume mounts based on your fail2ban installation.

## Production Considerations

1. **Security**:
   - Change default AUTH_TOKEN and AUTH_SECRET
   - Use HTTPS (configure nginx reverse proxy)
   - Restrict network access

2. **Fail2ban Access**:
   - The backend container needs access to fail2ban data
   - Consider using bind mounts or named volumes
   - Ensure proper permissions

3. **Reverse Proxy**:
   - Uncomment the nginx service in `docker-compose.yml` for a single entry point
   - Configure SSL/TLS certificates
   - Update CORS_ORIGIN accordingly

## Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild images
docker-compose build --no-cache

# Check service status
docker-compose ps
```

## Troubleshooting

### Backend can't access fail2ban
- Check volume mounts are correct
- Verify fail2ban is installed on the host
- Check file permissions

### Frontend can't connect to backend
- Verify backend is running: `docker-compose ps`
- Check CORS_ORIGIN matches frontend URL
- Review backend logs: `docker-compose logs backend`

### Health checks failing
- Check service logs: `docker-compose logs <service>`
- Verify ports are not in use
- Check network connectivity

