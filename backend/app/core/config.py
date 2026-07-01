from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "FiterAI API"
    api_prefix: str = "/api"


settings = Settings()
