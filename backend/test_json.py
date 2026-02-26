import json

data = "[[40.52968631473937, -74.43841338157655], [40.528373401674465, -74.43567752838136], [40.525853515103286, -74.43804860115053], [40.527239872189945, -74.44053769111635]]"

try:
    parsed = json.loads(data)
    print("Parsed type:", type(parsed))
    print("Parsed len:", len(parsed))
except Exception as e:
    print("Error parsing:", e)

# Test with single quotes if any
data_sq = "[[40.52, -74.4], [40.5, -74.4]]"
try:
    parsed = json.loads(data_sq)
    print("Parsed correctly!")
except Exception as e:
    print("Error:", e)
