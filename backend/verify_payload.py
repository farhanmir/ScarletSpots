import urllib.request
import json

try:
    with urllib.request.urlopen("http://localhost:8000/api/v1/lots?limit=100") as response:
        content = response.read().decode()
        data = json.loads(content)
        found = False
        for lot in data:
            if lot.get("coordinates") and len(lot["coordinates"]) > 0:
                print(f"LOT: {lot['name']}")
                print(f"COORDINATES TYPE: {type(lot['coordinates'])}")
                print(f"FIRST COORD: {lot['coordinates'][0]}")
                found = True
                break
        if not found:
            print("No lots found with coordinates!")
except Exception as e:
    print(f"Error: {e}")
