FROM python:3.12-slim-bookworm
WORKDIR /app
COPY requirements.txt requirements.postgres.txt ./
RUN python -m pip install --no-cache-dir -r requirements.postgres.txt
COPY postgres_app.py ./app.py
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
