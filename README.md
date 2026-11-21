# GrabRide-Fare-Time-Cost-Optimization
A Machine Learning Data Collection Project.

How much does a GrabRide from Monash University Malaysia to KL Sentral cost between 6:30am and 8:00am, and when is the cheapest time to book? This project collects the fares, trains a model on them, and puts the answer on a website.

## Data
The dataset is in [data/GrabRide_Data.csv](data/GrabRide_Data.csv). Fares were recorded every 5 minutes from 6:30am to 8:00am over 8 weekday mornings (24 November to 3 December 2025), giving 143 rows.

| Column | Description |
| --- | --- |
| `date`, `time` | When the fare was checked. |
| `fare_standard_RM` | Standard GrabRide fare in RM. |
| `driver_est_min` | Estimated minutes until the driver arrives. |
| `distance_km`, `duration_min` | Trip distance and duration. |
| `fastest_route` | `LSA_E5` (Shah Alam Expressway), `LBP_E10` (New Pantai Expressway) or `LP_Route_2` (Federal Highway). |
| `weather` | `Clear` or `Rainy`. |
| `imap_distance_km`, `imap_duration_min`, `tolls_true_false` | Navigation estimates and whether the route has tolls. Recorded from 26 November onwards. |

Rain made a big difference. Rainy mornings averaged RM 52.46, while clear mornings averaged RM 31.06.

## Model
The notebook in [notebooks/](notebooks/) trains a Random Forest Regressor (300 trees, max depth 12, at least 3 samples per leaf) on an 80/20 train/test split.

- Mean Absolute Error: RM 6.32.
- Each prediction is labelled Cheap (RM 25.00 or less), Average (up to RM 42.28) or Pricey.
- To predict a booking time, only the time and day of the week change. Everything else is held at its median value.
- The recommended time is the cheapest 5-minute slot between now and 8:00am.

## Website
The website in [docs/](docs/) has two pages.

- **Forecast** shows the cheapest time to book between 6:30am and 8:00am, and how the fare moves through the morning.
- **Your rides** lets you predict with your own ride data. Your rides are saved in your browser and can be exported in the same format as the dataset.

## Backend
The model from the notebook is served by the API in [backend/](backend/). To run it:
```
cd backend
pip install -r requirements.txt
python train.py
uvicorn app:app --reload
```
Then set `FARE_API` in `docs/app.js` to `http://127.0.0.1:8000`. Without it, the website uses the model's forecast for 4 December 2025.

| Endpoint | Returns |
| --- | --- |
| `/predict?date=2025-12-04&time=06:45` | Predicted fare and its label. |
| `/recommend?date=2025-12-04&current_time=06:45` | Cheapest time to book before 8:00am. |
| `/predict-window?date=2025-12-04` | Predicted fare for every 5-minute slot. |
| `/model-info` | MAE, label thresholds and the values held at their medians. |

## Project Structure
```
backend/      API, training script and trained model
data/         Dataset
docs/         Website
notebooks/    Data analysis and model
screenshots/  Example GrabRide and Google Maps screenshots
```

## Limitations
- The data covers 8 weekday mornings only, so weekend predictions are a guess.
- The model's error (RM 6.32) is bigger than most of the differences between time slots. Treat close calls as a tie.
