"""
MediaVault — Production Server
--------------------------------
Run with:   python start.py
Accessible: http://<your-ip>:8000
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        workers=1,
        timeout_keep_alive=300,
        limit_concurrency=100,
        access_log=False,
    )
