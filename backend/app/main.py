from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import garments, health, renders, sessions, tryon, wardrobe
from app.core.config import settings

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    f"{settings.data_url_prefix}/garments",
    StaticFiles(directory=settings.garments_dir),
    name="garment-assets",
)

app.include_router(health.router)
app.include_router(sessions.router, prefix=settings.api_prefix)
app.include_router(garments.router, prefix=settings.api_prefix)
app.include_router(tryon.router, prefix=settings.api_prefix)
app.include_router(renders.router, prefix=settings.api_prefix)
app.include_router(wardrobe.router, prefix=settings.api_prefix)
