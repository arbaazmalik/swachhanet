from fastapi import APIRouter, File, UploadFile, HTTPException
from api.controllers import (
    ClassificationResponse, 
    HotspotRequest, 
    HotspotResponse,
    PredictionRequest,
    PredictionResponse
)
from services.image_service import image_service
from services.geo_service import geo_service
from services.prediction_service import prediction_service
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.post("/predict-waste", response_model=ClassificationResponse)
async def predict_waste(file: UploadFile = File(...)):
    """
    Classifies an uploaded waste image into categories (wet, dry, plastic, hazardous).
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
        
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty image file.")
        result = image_service.predict(contents)
        return ClassificationResponse(**result)
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Invalid image input: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        logger.error(f"Model file missing: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Inference runtime error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error classifying image: {e}")
        raise HTTPException(status_code=500, detail="Unexpected prediction error.")

@router.post("/detect-hotspot", response_model=HotspotResponse)
async def detect_hotspot(request: HotspotRequest):
    """
    Detects clusters (hotspots) from a list of latitude/longitude coordinates.
    """
    try:
        coords_list = [{"lat": c.lat, "long": c.long} for c in request.coordinates]
        result = geo_service.detect_hotspots(coords_list)
        return HotspotResponse(**result)
    except Exception as e:
        logger.error(f"Error detecting hotspots: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict-trend", response_model=PredictionResponse)
async def predict_trend(request: PredictionRequest):
    """
    Predicts future waste generation trends based on historical data.
    """
    try:
        historical = [item.model_dump() for item in request.historical_data]
        forecast = prediction_service.predict_trend(
            historical_data=historical, 
            forecast_days=request.forecast_days
        )
        return PredictionResponse(forecast=forecast)
    except ValueError as e:
        logger.warn(f"Insufficient or invalid trend data: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Error predicting trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))
