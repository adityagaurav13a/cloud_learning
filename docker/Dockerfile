FROM ubuntu:22.04
WORKDIR /app

RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN python3 -m venv /app/venv1 && \
    /app/venv1/bin/pip install --no-cache-dir -r requirements.txt

ENV PATH="/app/venv1/bin:$PATH"

COPY devops/ /app/

# migrate at build time — SQLite db baked into image
RUN python3 manage.py migrate

EXPOSE 8000

# pure exec form — no shell, no bash, no &&
ENTRYPOINT ["python3", "manage.py"]
CMD ["runserver", "0.0.0.0:8000"]
