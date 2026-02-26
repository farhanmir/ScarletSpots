import urllib.request
import json

try:
    with urllib.request.urlopen("http://localhost:8000/api/v1/lots?limit=100") as response:
        data = json.loads(response.read().decode())
        found_coords = False
        for lot in data:
            if lot.get("coordinates"):
                found_coords = True
                print("Found lot with coords:", lot.get("name"))
                print("Type:", type(lot["coordinates"]))
                print("Length of poly array:", len(lot["coordinates"]))
                break
        if not found_coords:
            print("NO lots with coordinates returned from API!")
except Exception as e:
    print("Error:", e)
