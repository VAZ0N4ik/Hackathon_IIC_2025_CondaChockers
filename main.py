from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from jwt import encode, decode
from datetime import datetime, timedelta
from enum import Enum as PyEnum
from typing import List, Optional

# База данных
DATABASE_URL = "sqlite:///./rooms.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


# Базовый класс для моделей
class Base(DeclarativeBase):
    pass


# Модели БД
class RoleEnum(str, PyEnum):
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT_ORG = "student_org"
    STUDENT = "student"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    password = Column(String)  # Для прототипа храним пароль в открытом виде
    full_name = Column(String)
    role = Column(String)
    org_name = Column(String, nullable=True)


class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True)
    number = Column(String, unique=True)
    status = Column(String)  # available, unavailable, booked


class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("rooms.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    start_time = Column(DateTime)
    end_time = Column(DateTime)


# Создание таблиц
Base.metadata.create_all(engine)

# FastAPI приложение
app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


# Helpers
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = decode(token, "secret_key", algorithms=["HS256"])
        user = db.query(User).filter(User.id == payload["sub"]).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


# Эндпоинты
@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or user.password != form_data.password:  # Простое сравнение паролей
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    token = encode(
        {"sub": user.id, "exp": datetime.utcnow() + timedelta(days=1)},
        "secret_key",
        algorithm="HS256"
    )
    return {"access_token": token, "token_type": "bearer"}


@app.get("/users/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role
    }


@app.get("/rooms")
async def get_rooms(db: Session = Depends(get_db)):
    return db.query(Room).all()


@app.get("/bookings")
async def get_bookings(db: Session = Depends(get_db)):
    return db.query(Booking).all()


@app.post("/rooms/{room_id}/book")
async def book_room(
        room_id: int,
        start_time: datetime,
        end_time: datetime,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.status == "unavailable":
        raise HTTPException(status_code=400, detail="Room is not available for booking")

    # Проверка существующих бронирований
    existing = db.query(Booking).filter(
        Booking.room_id == room_id,
        Booking.start_time < end_time,
        Booking.end_time > start_time
    ).first()

    if existing:
        existing_user = db.query(User).filter(User.id == existing.user_id).first()
        if RoleEnum[existing_user.role].value > RoleEnum[current_user.role].value:
            raise HTTPException(
                status_code=400,
                detail="Room already booked by higher priority user"
            )
        # Если текущий пользователь имеет больший приоритет, удаляем существующее бронирование
        db.delete(existing)

    booking = Booking(
        room_id=room_id,
        user_id=current_user.id,
        start_time=start_time,
        end_time=end_time
    )
    db.add(booking)

    try:
        db.commit()
        return {"status": "success", "message": "Room booked successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not book room")


# Создание тестовых данных
def create_test_data():
    db = SessionLocal()
    try:
        # Проверяем, есть ли уже тестовый пользователь
        if not db.query(User).filter(User.username == "admin").first():
            # Создаем тестовых пользователей
            test_users = [
                {
                    "username": "admin",
                    "password": "admin123",
                    "full_name": "Admin User",
                    "role": "admin"
                },
                {
                    "username": "teacher",
                    "password": "teacher123",
                    "full_name": "Test Teacher",
                    "role": "teacher"
                },
                {
                    "username": "org",
                    "password": "org123",
                    "full_name": "Student Organization",
                    "role": "student_org"
                },
                {
                    "username": "student",
                    "password": "student123",
                    "full_name": "Test Student",
                    "role": "student"
                }
            ]

            for user_data in test_users:
                user = User(**user_data)
                db.add(user)

            # Добавляем тестовые комнаты
            test_rooms = [
                Room(number="101", status="available"),
                Room(number="102", status="unavailable"),
                Room(number="103", status="available")
            ]
            for room in test_rooms:
                db.add(room)

            db.commit()
            print("Test data created successfully!")
            print("\nTest users created:")
            for user in test_users:
                print(f"Username: {user['username']}, Password: {user['password']}, Role: {user['role']}")
    except Exception as e:
        print(f"Error creating test data: {e}")
        db.rollback()
    finally:
        db.close()


# Создаем тестовые данные при запуске
create_test_data()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)