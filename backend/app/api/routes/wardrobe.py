from fastapi import APIRouter

router = APIRouter(prefix="/wardrobe", tags=["wardrobe"])


@router.get("")
def get_wardrobe() -> dict[str, list[dict[str, str]]]:
    return {"items": []}
