# Backend Setup Guide

## Prerequisites

- [Python 3.10+](https://www.python.org/downloads/)
- [PostgreSQL](https://www.postgresql.org/download/) (Optional, if running local DB)
- [Supabase Account](https://supabase.com/)

## Installation

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Create a virtual environment:**
    ```bash
    python -m venv venv
    ```

3.  **Activate the virtual environment:**
    - Windows:
      ```bash
      .\venv\Scripts\activate
      ```
    - macOS/Linux:
      ```bash
      source venv/bin/activate
      ```

4.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Environment Variables

Ensure you have a `.env` file in the `backend` directory with the following keys:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## Running the Server

Start the development server with:

```bash
uvicorn main:app --reload
```


## Verification

To verify that your environment is set up correctly, run the following command from the project root:

```bash
python check_backend.py
```

