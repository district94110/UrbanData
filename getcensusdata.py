import pandas as pd
import requests

# Load your dataset
file_path = "gazetteer_with_population.csv"
df = pd.read_csv(file_path)

# Your Census API key (replace with your own key)
API_KEY = "YOUR_CENSUS_API_KEY"

# Specify ACS endpoint and variable
ACS_YEAR = "2021"
ACS_DATASET = "acs/acs5"
INCOME_VARIABLE = "B19301_001E"  # Median income in the past 12 months (in 2021 inflation-adjusted dollars)

# Function to get income data for all places
def get_income_data():
    url = "https://api.census.gov/data/2023/acs/acs5"
    params = {
        "get": "NAME,B19301_001E",
        "for": "place:*",
        "in": "state:*"
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; MyApp/1.0; +https://yourdomain.com)"
    }
    response = requests.get(url, params=params)
    data = response.json()

    # Convert to DataFrame
    cols = data[0]
    values = data[1:]
    income_df = pd.DataFrame(values, columns=cols)

    # Combine state and place codes into a GEOID to match your dataset
    income_df["GEOID"] = income_df["state"] + income_df["place"]
    income_df[INCOME_VARIABLE] = pd.to_numeric(income_df[INCOME_VARIABLE], errors="coerce")

    return income_df[["GEOID", INCOME_VARIABLE]]

# Get income data and merge with existing dataframe
income_data = get_income_data()
df["GEOID"] = df["GEOID"].astype(str).str.zfill(7)  # Ensure GEOID is zero-padded to 7 digits
merged_df = df.merge(income_data, on="GEOID", how="left")

# Save to new CSV
output_path = "with_income.csv"
merged_df.to_csv(output_path, index=False)

print("Merged dataset saved to:", output_path)
