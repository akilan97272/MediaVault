import logging
import threading
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timedelta
from workerFiles.file_renamer import process_all_users, print_results

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FileRenamerScheduler")

# Global scheduler instance
_scheduler: BackgroundScheduler = None
_scheduler_lock = threading.Lock()


def start_scheduler():
    """Start the background scheduler (call this on app startup)."""
    global _scheduler
    
    with _scheduler_lock:
        if _scheduler is not None and _scheduler.running:
            logger.warning("Scheduler already running")
            return
        
        try:
            _scheduler = BackgroundScheduler()
            
            # Add job to run every 2 hours
            _scheduler.add_job(
                _run_file_renaming_task,
                IntervalTrigger(hours=2),
                id='file_renaming_task',
                name='File Renaming Task (every 2 hours)',
                replace_existing=True,
                next_run_time=datetime.now() + timedelta(seconds=10),  # run 10s after startup
            )
            
            _scheduler.start()
            logger.info("✓ File Renamer Scheduler started (runs every 2 hours)")
            print("✓ File Renamer Scheduler started (runs every 2 hours)")
            
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")


def stop_scheduler():
    """Stop the background scheduler (call this on app shutdown)."""
    global _scheduler
    
    with _scheduler_lock:
        if _scheduler is None or not _scheduler.running:
            return
        
        try:
            _scheduler.shutdown(wait=False)
            _scheduler = None
            logger.info("✓ File Renamer Scheduler stopped")
        except Exception as e:
            logger.error(f"Failed to stop scheduler: {e}")


def _run_file_renaming_task():
    """Task that runs on schedule."""
    try:
        logger.info("=" * 70)
        logger.info(f"🔄 FILE RENAMING TASK STARTED at {datetime.now().isoformat()}")
        logger.info("=" * 70)
        
        # Run the renaming process
        results = process_all_users(dry_run=False)
        
        # Log results
        logger.info(f"✓ Renamed: {results['total_renamed']} files")
        logger.info(f"🔄 Converted (WebP→JPG): {results['total_converted']} files")
        logger.info(f"⊘ Skipped: {results['total_skipped']} files")
        logger.info(f"✗ Errors: {results['total_errors']}")
        
        # Print detailed results
        print_results(results)
        
        # Log per-folder summary
        for folder, data in results["folders"].items():
            if data["renamed"] or data["converted"] or data["errors"]:
                logger.info(f"  {folder}: {len(data['renamed'])} renamed, {len(data['converted'])} converted, {len(data['errors'])} errors")
        
        logger.info("=" * 70)
        logger.info(f"✓ FILE RENAMING TASK COMPLETED")
        logger.info("=" * 70)
        
    except Exception as e:
        logger.error(f"✗ File renaming task failed: {e}", exc_info=True)


def get_scheduler_status() -> dict:
    """Get current scheduler status."""
    global _scheduler
    
    if _scheduler is None:
        return {"status": "not_running", "message": "Scheduler not initialized"}
    
    if not _scheduler.running:
        return {"status": "stopped", "message": "Scheduler is stopped"}
    
    jobs = _scheduler.get_jobs()
    job = jobs[0] if jobs else None
    
    return {
        "status": "running",
        "jobs": len(jobs),
        "next_run": str(job.next_run_time) if job else None,
        "interval": "2 hours",
        "message": "Scheduler is running - processes files every 2 hours"
    }


if __name__ == "__main__":
    # For testing
    start_scheduler()
    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        stop_scheduler()
