from datetime import timedelta, datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import  psycopg2
from psycopg2.extras import RealDictCursor
from uuid import UUID
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Конкретный origin вместо "*"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Подключение к базе данных
def get_db_connection():
    conn = psycopg2.connect(
        dbname="fast_api",
        user="postgres",
        password="postgres",
        host="localhost",
        port = "5434",
        cursor_factory=RealDictCursor
    )
    return conn


# Функции для работы с датами
def get_week_range(date_str: str) -> tuple:
    """Получает начальную и конечную дату недели"""
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    monday = date_obj - timedelta(days=date_obj.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


# Модели Pydantic для валидации данных
class User(BaseModel):
    name: str
    username: str
    password: str
    priority: str
    group: str


class Cabinet(BaseModel):
    number: int
    floor: int
    type: str
    description: str


class PairCreate(BaseModel):
    date: str
    start_time: str
    end_time: str


class PairCabinet(BaseModel):
    pair_id: UUID
    cabinet_id: UUID
    user_id: UUID
    purpose: str


class LoginRequest(BaseModel):
    username: str
    password: str


# Инициализация базы данных
@app.post("/init/")
def init():
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("""
        -- Create enum type for user priority
        CREATE TYPE user_priority AS ENUM ('prostoi-smertni', 'union', 'prepod', 'dispetcher');

        -- Create Users table
        CREATE TABLE Users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(50) NOT NULL,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(50) NOT NULL,
            priority user_priority NOT NULL,
            "group" VARCHAR(50) NOT NULL
        );

        -- Create Cabinets table
        CREATE TABLE Cabinets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            number INTEGER NOT NULL UNIQUE,
            floor INTEGER NOT NULL,
            type TEXT NOT NULL,
            description TEXT
        );

        -- Create Pairs table with dates
        CREATE TABLE Pairs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            CONSTRAINT check_time_order CHECK (start_time < end_time)
        );

        -- Create mapping table Pairs_Cabinets
        CREATE TABLE Pairs_Cabinets (
            pair_id UUID NOT NULL REFERENCES Pairs(id) ON DELETE CASCADE,
            cabinet_id UUID NOT NULL REFERENCES Cabinets(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
            purpose TEXT,
            PRIMARY KEY (pair_id, cabinet_id)
        );

        -- Create indexes
        CREATE INDEX idx_pairs_date ON Pairs(date);
        CREATE INDEX idx_cabinets_floor ON Cabinets(floor);
        CREATE INDEX idx_pairs_cabinets_user ON Pairs_Cabinets(user_id);
        """)
        conn.commit()


# Авторизация
@app.post("/users/login")
async def login(login_data: LoginRequest):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        # Проверяем учетные данные
        cur.execute(
            """
            SELECT id, name, username, priority, "group"
            FROM Users 
            WHERE username = %s AND password = %s
            """,
            (login_data.username, login_data.password)
        )
        user = cur.fetchone()

        if user is None:
            raise HTTPException(
                status_code=401,
                detail="Неверное имя пользователя или пароль"
            )

        return user
    finally:
        conn.close()


# CRUD операции для Users
@app.post("/users/", response_model=User)
def create_user(user: User):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO Users (name, username, password, priority, "group")
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *;
        """,
        (user.name, user.username, user.password, user.priority, user.group)
    )
    new_user = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return new_user


@app.get("/users/{user_id}", response_model=User)
def read_user(user_id: UUID):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM Users WHERE id = %s;", (str(user_id),))
    user = cur.fetchone()
    cur.close()
    conn.close()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# CRUD операции для Cabinets
@app.post("/cabinets/", response_model=Cabinet)
def create_cabinet(cabinet: Cabinet):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO Cabinets (number, floor, type, description)
        VALUES (%s, %s, %s, %s)
        RETURNING *;
        """,
        (cabinet.number, cabinet.floor, cabinet.type, cabinet.description)
    )
    new_cabinet = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return new_cabinet


@app.get("/cabinets/")
def get_cabinets(date: Optional[str] = None, pair: Optional[int] = None):
    conn = get_db_connection()
    try:
        cur = conn.cursor()

        if date and pair:
            # Получаем время пары
            pair_times = {
                1: ('08:00', '09:35'),
                2: ('09:45', '11:20'),
                3: ('11:30', '13:05'),
                4: ('13:30', '15:05'),
                5: ('15:15', '16:50'),
                6: ('17:00', '18:35'),
                7: ('18:45', '20:20'),
                8: ('20:30', '22:05')
            }
            start_time, end_time = pair_times[int(pair)]

            # Получаем свободные кабинеты
            cur.execute("""
                SELECT c.* FROM Cabinets c
                WHERE c.id NOT IN (
                    SELECT pc.cabinet_id
                    FROM Pairs_Cabinets pc
                    JOIN Pairs p ON p.id = pc.pair_id
                    WHERE p.date = %s
                    AND p.start_time = %s
                    AND p.end_time = %s
                )
                ORDER BY c.number;
            """, (date, start_time, end_time))
        else:
            # Возвращаем все кабинеты
            cur.execute("SELECT * FROM Cabinets ORDER BY number;")

        cabinets = cur.fetchall()
        return cabinets
    finally:
        conn.close()


@app.get("/cabinets/{cabinet_id}")
def read_cabinet(cabinet_id: UUID):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM Cabinets WHERE id = %s;", (str(cabinet_id),))
    cabinet = cur.fetchone()
    cur.close()
    conn.close()
    if cabinet is None:
        raise HTTPException(status_code=404, detail="Cabinet not found")
    return cabinet


@app.get("/cabinets/{cabinet_id}/schedule")
def get_cabinet_schedule(cabinet_id: UUID, date: Optional[str] = None):
    conn = get_db_connection()
    try:
        cur = conn.cursor()

        if date:
            # Получаем диапазон дат для недели
            week_start, week_end = get_week_range(date)

            cur.execute("""
                SELECT 
                    p.id as pair_id,
                    p.date,
                    p.start_time,
                    p.end_time,
                    u.name as user_name,
                    u.priority as user_role,
                    u."group" as user_group,
                    pc.purpose
                FROM Pairs p
                JOIN Pairs_Cabinets pc ON p.id = pc.pair_id
                JOIN Users u ON u.id = pc.user_id
                WHERE pc.cabinet_id = %s
                AND p.date BETWEEN %s AND %s
                ORDER BY p.date, p.start_time;
            """, (str(cabinet_id), week_start, week_end))

            schedule = cur.fetchall()

            # Преобразуем даты в строки для JSON
            for item in schedule:
                item['date'] = item['date'].strftime('%Y-%m-%d')
                item['start_time'] = item['start_time'].strftime('%H:%M')
                item['end_time'] = item['end_time'].strftime('%H:%M')

            return schedule
        else:
            cur.execute("""
                SELECT 
                    p.id as pair_id,
                    p.date,
                    p.start_time,
                    p.end_time,
                    u.name as user_name,
                    u.priority as user_role,
                    u."group" as user_group,
                    pc.purpose
                FROM Pairs p
                JOIN Pairs_Cabinets pc ON p.id = pc.pair_id
                JOIN Users u ON u.id = pc.user_id
                WHERE pc.cabinet_id = %s
                ORDER BY p.date, p.start_time;
            """, (str(cabinet_id),))

            schedule = cur.fetchall()

            # Преобразуем даты в строки для JSON
            for item in schedule:
                item['date'] = item['date'].strftime('%Y-%m-%d')
                item['start_time'] = item['start_time'].strftime('%H:%M')
                item['end_time'] = item['end_time'].strftime('%H:%M')

            return schedule
    finally:
        conn.close()


# CRUD операции для Pairs
@app.post("/pairs/")
def create_pair(pair: PairCreate):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO Pairs (date, start_time, end_time)
            VALUES (%s, %s, %s)
            RETURNING id, date, start_time, end_time;
            """,
            (pair.date, pair.start_time, pair.end_time)
        )
        new_pair = cur.fetchone()
        conn.commit()
        return new_pair
    finally:
        conn.close()


# В main.py обновите эндпоинт pairs_cabinets

@app.post("/pairs_cabinets/")
def create_pair_cabinet(pair_cabinet: PairCabinet):
    conn = get_db_connection()
    try:
        cur = conn.cursor()

        # Сначала получаем информацию о паре, которую пытаемся забронировать
        cur.execute(
            """
            SELECT date, start_time, end_time
            FROM Pairs
            WHERE id = %s
            """,
            (str(pair_cabinet.pair_id),)
        )
        new_pair = cur.fetchone()

        if not new_pair:
            raise HTTPException(status_code=404, detail="Пара не найдена")

        # Получаем приоритет текущего пользователя
        cur.execute(
            "SELECT priority FROM Users WHERE id = %s",
            (str(pair_cabinet.user_id),)
        )
        current_user = cur.fetchone()
        if not current_user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        # Проверяем существующие бронирования для этого кабинета в это время
        cur.execute(
            """
            SELECT pc.pair_id, u.priority as user_priority
            FROM Pairs_Cabinets pc
            JOIN Pairs p ON p.id = pc.pair_id
            JOIN Users u ON u.id = pc.user_id
            WHERE pc.cabinet_id = %s
            AND p.date = %s
            AND p.start_time = %s
            AND p.end_time = %s
            """,
            (
                str(pair_cabinet.cabinet_id),
                new_pair['date'],
                new_pair['start_time'],
                new_pair['end_time']
            )
        )

        existing_booking = cur.fetchone()

        priorities = {
            'dispetcher': 4,
            'prepod': 3,
            'union': 2,
            'prostoi-smertni': 1
        }

        current_priority = priorities[current_user['priority']]

        if existing_booking:
            existing_priority = priorities[existing_booking['user_priority']]

            # Если приоритет текущего пользователя ниже или равен существующему
            if current_priority <= existing_priority:
                raise HTTPException(
                    status_code=400,
                    detail="Недостаточно прав для изменения этой брони"
                )

            # Если приоритет выше - удаляем существующее бронирование
            cur.execute(
                """
                DELETE FROM Pairs_Cabinets 
                WHERE pair_id = %s AND cabinet_id = %s
                """,
                (str(existing_booking['pair_id']), str(pair_cabinet.cabinet_id))
            )

        # Создаем новое бронирование
        cur.execute(
            """
            INSERT INTO Pairs_Cabinets (pair_id, cabinet_id, user_id, purpose)
            VALUES (%s, %s, %s, %s)
            RETURNING pair_id, cabinet_id, user_id, purpose;
            """,
            (
                str(pair_cabinet.pair_id),
                str(pair_cabinet.cabinet_id),
                str(pair_cabinet.user_id),
                pair_cabinet.purpose
            )
        )

        new_pair_cabinet = cur.fetchone()
        conn.commit()
        return new_pair_cabinet
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


# Запуск сервера
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)