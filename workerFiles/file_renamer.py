import os
import re
from pathlib import Path
from datetime import datetime

# Configuration
MEDIA_DIR = os.path.join(os.path.dirname(__file__), "media")
ALLOWED_EXTENSIONS = {
    '.jpg', '.jpeg', '.png', '.gif',      # Images
    '.mp4', '.webm', '.mkv',              # Videos
    '.webp'                                # Will convert to jpg
}
WEBP_ENABLED = False  # Set to True if PIL is available for conversion

# Try to import PIL for webp conversion
try:
    from PIL import Image
    WEBP_ENABLED = True
except ImportError:
    WEBP_ENABLED = False
    print("⚠️  PIL not installed - webp conversion disabled. Install with: pip install Pillow")

def is_valid_file(filename: str) -> bool:
    """Check if file should be processed (has allowed extension)."""
    _, ext = os.path.splitext(filename)
    return ext.lower() in ALLOWED_EXTENSIONS


def convert_webp_to_jpg(file_path: str) -> tuple[bool, str]:
    """
    Convert .webp image to .jpg format.
    
    Args:
        file_path: Path to .webp file
    
    Returns:
        (success: bool, message: str)
    """
    if not WEBP_ENABLED:
        return False, "PIL not available"
    
    try:
        # Open webp file
        img = Image.open(file_path)
        
        # Convert RGBA to RGB if needed (jpg doesn't support transparency)
        if img.mode in ('RGBA', 'P'):
            rgb_img = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            rgb_img.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
            img = rgb_img
        
        # Create new filename with .jpg
        base_path = os.path.splitext(file_path)[0]
        jpg_path = base_path + '.jpg'
        
        # Save as jpg
        img.save(jpg_path, 'JPEG', quality=95)
        
        # Delete original webp
        os.remove(file_path)
        
        return True, f"Converted to: {os.path.basename(jpg_path)}"
    except Exception as e:
        return False, f"Conversion failed: {str(e)}"


def get_next_number(folder_path: str, folder_name: str) -> int:
    """Get the next available number for the folder."""
    max_num = 0
    pattern = re.compile(rf"^{re.escape(folder_name)}_(\d+)\.", re.IGNORECASE)
    
    if os.path.isdir(folder_path):
        for filename in os.listdir(folder_path):
            match = pattern.match(filename)
            if match:
                num = int(match.group(1))
                max_num = max(max_num, num)
    
    return max_num + 1


def rename_files_in_folder(folder_path: str, folder_name: str, dry_run: bool = False) -> dict:
    """
    Rename all files in a folder to folder_name_001, folder_name_002, etc.
    Convert .webp files to .jpg
    
    Args:
        folder_path: Full path to the folder
        folder_name: Name of the folder (used in renamed files)
        dry_run: If True, only print what would be done, don't actually rename
    
    Returns:
        dict with rename results
    """
    results = {
        "folder": folder_name,
        "renamed": [],
        "converted": [],
        "skipped": [],
        "errors": []
    }
    
    if not os.path.isdir(folder_path):
        results["errors"].append(f"Path is not a directory: {folder_path}")
        return results
    
    counter = get_next_number(folder_path, folder_name)
    
    try:
        items = sorted(os.listdir(folder_path))
    except PermissionError as e:
        results["errors"].append(f"Permission denied: {e}")
        return results
    
    for filename in items:
        file_path = os.path.join(folder_path, filename)
        
        # Skip if it's a folder
        if os.path.isdir(file_path):
            results["skipped"].append(f"(folder) {filename}")
            continue
        
        # Skip if extension not allowed
        if not is_valid_file(filename):
            results["skipped"].append(f"(unsupported) {filename}")
            continue
        
        _, ext = os.path.splitext(filename)
        
        # ===== Handle WEBP Conversion =====
        if ext.lower() == '.webp':
            if not dry_run:
                success, msg = convert_webp_to_jpg(file_path)
                if success:
                    # Get the new filename after conversion
                    new_filename = os.path.splitext(filename)[0] + '.jpg'
                    results["converted"].append({
                        "old": filename,
                        "new": new_filename,
                        "message": msg
                    })
                    file_path = os.path.join(folder_path, new_filename)
                    ext = '.jpg'
                else:
                    results["errors"].append(f"Failed to convert {filename}: {msg}")
                    continue
            else:
                # Dry run - just show what would happen
                new_filename = os.path.splitext(filename)[0] + '.jpg'
                results["converted"].append({
                    "old": filename,
                    "new": new_filename,
                    "message": "Would convert"
                })
                continue
        
        # ===== Handle File Renaming =====
        # Skip if already in renamed format (e.g., Aki_001.jpg)
        renamed_pattern = re.compile(rf"^{re.escape(folder_name)}_\d+\.", re.IGNORECASE)
        if renamed_pattern.match(filename):
            results["skipped"].append(f"(already renamed) {filename}")
            continue
        
        # Build new filename
        new_filename = f"{folder_name}_{counter:03d}{ext}"
        new_path = os.path.join(folder_path, new_filename)
        
        # Check for conflicts
        if os.path.exists(new_path) and new_path != file_path:
            results["errors"].append(f"Target exists: {new_filename}")
            counter += 1
            continue
        
        # Perform rename
        try:
            if not dry_run:
                os.rename(file_path, new_path)
            results["renamed"].append({
                "old": filename,
                "new": new_filename
            })
        except Exception as e:
            results["errors"].append(f"Failed to rename {filename}: {e}")
        
        counter += 1
    
    return results


def process_all_users(dry_run: bool = False) -> dict:
    """
    Process all user folders in MEDIA_DIR.
    
    Args:
        dry_run: If True, only print what would be done
    
    Returns:
        dict with results for each folder
    """
    results = {
        "timestamp": datetime.now().isoformat(),
        "dry_run": dry_run,
        "folders": {},
        "total_renamed": 0,
        "total_converted": 0,
        "total_skipped": 0,
        "total_errors": 0
    }
    
    if not os.path.isdir(MEDIA_DIR):
        results["error"] = f"Media directory not found: {MEDIA_DIR}"
        return results
    
    # Iterate through user folders
    for item in os.listdir(MEDIA_DIR):
        item_path = os.path.join(MEDIA_DIR, item)
        
        # Skip if not a directory
        if not os.path.isdir(item_path):
            continue
        
        # Skip 'shared' folder (process only user folders)
        if item.lower() == 'shared':
            continue
        
        # Process the user folder
        folder_results = rename_files_in_folder(item_path, item, dry_run=dry_run)
        results["folders"][item] = folder_results
        
        results["total_renamed"] += len(folder_results["renamed"])
        results["total_converted"] += len(folder_results["converted"])
        results["total_skipped"] += len(folder_results["skipped"])
        results["total_errors"] += len(folder_results["errors"])
    
    return results


def print_results(results: dict) -> None:
    """Pretty print the results."""
    print("\n" + "="*60)
    print("FILE RENAMER WORKER RESULTS")
    print("="*60)
    print(f"Timestamp: {results.get('timestamp')}")
    print(f"Dry Run: {results.get('dry_run', False)}")
    print(f"\nSummary:")
    print(f"  Total Renamed: {results['total_renamed']}")
    print(f"  Total Converted (WebP→JPG): {results['total_converted']}")
    print(f"  Total Skipped: {results['total_skipped']}")
    print(f"  Total Errors: {results['total_errors']}")
    
    if results["folders"]:
        print(f"\nDetails by Folder:")
        for folder, data in results["folders"].items():
            if data["renamed"] or data["converted"] or data["errors"]:
                print(f"\n  📁 {folder}/")
                if data["renamed"]:
                    print(f"    ✓ Renamed ({len(data['renamed'])}):")
                    for item in data["renamed"][:5]:
                        print(f"      {item['old']} → {item['new']}")
                    if len(data["renamed"]) > 5:
                        print(f"      ... and {len(data['renamed']) - 5} more")
                if data["converted"]:
                    print(f"    🔄 Converted WebP ({len(data['converted'])}):")
                    for item in data["converted"][:5]:
                        print(f"      {item['old']} → {item['new']}")
                    if len(data["converted"]) > 5:
                        print(f"      ... and {len(data['converted']) - 5} more")
                if data["skipped"]:
                    print(f"    ⊘ Skipped ({len(data['skipped'])}):")
                    for item in data["skipped"][:3]:
                        print(f"      {item}")
                    if len(data["skipped"]) > 3:
                        print(f"      ... and {len(data['skipped']) - 3} more")
                if data["errors"]:
                    print(f"    ✗ Errors ({len(data['errors'])}):")
                    for err in data["errors"]:
                        print(f"      {err}")
    
    print("\n" + "="*60 + "\n")


if __name__ == "__main__":
    import sys
    
    # Check for dry-run flag
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv
    
    if dry_run:
        print("🔍 Running in DRY-RUN mode (no files will be changed)")
    
    # Process all users
    results = process_all_users(dry_run=dry_run)
    
    # Print results
    print_results(results)
    
    # Save results to log file
    log_file = os.path.join(os.path.dirname(__file__), "rename_log.json")
    try:
        import json
        with open(log_file, "w") as f:
            json.dump(results, f, indent=2)
        print(f"✓ Results saved to: {log_file}")
    except Exception as e:
        print(f"✗ Failed to save log: {e}")
