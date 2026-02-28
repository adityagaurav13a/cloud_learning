FROM python:3.12-slim

WORKDIR /app

# No need for apt-get python3/pip/venv — already included in python:3.12-slim
COPY requirements.txt /app/

RUN pip install --no-cache-dir -r requirements.txt

COPY devops/ /app/

RUN python manage.py migrate

EXPOSE 8000

ENTRYPOINT ["python", "manage.py"]
CMD ["runserver", "0.0.0.0:8000"]
