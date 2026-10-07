from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from utils.config_loader import load_config
from utils.logger import get_logger

logger = get_logger(__name__)

# Load config
try:
    config = load_config()
    logger.info("Configuration loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load configuration: {e}")
    config = {}

app = FastAPI(
    title="EcoIntellect AI Backend",
    description="AI/ML Backend for Waste Management System",
    version="1.0.0"
)

# CORS Middleware
cors_origins = os.getenv("AIML_ALLOWED_ORIGINS", "*")
allow_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()] or ["*"]
allow_credentials = "*" not in allow_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

from services.image_service import image_service

@app.on_event("startup")
async def startup_event():
    try:
        logger.info("Initializing AI models at startup...")
        image_service.is_ready()
        logger.info("AI model initialization completed.")
    except Exception as e:
        logger.warn(f"AI model startup initialization note: {e}")

@app.get("/")
async def root():
    return {"message": "Welcome to EcoIntellect AI Backend"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "aiml"}

@app.get("/ready")
@app.get("/api/v1/ready")
async def readiness_check():
    status = image_service.get_status()
    return {"status": "ready" if status["ready"] else "degraded", **status}

# We will include routers from api.routes here later
from api.routes import router as api_router
app.include_router(api_router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
