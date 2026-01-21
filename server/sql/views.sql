CREATE OR REPLACE VIEW v_departures AS
SELECT
    s.stop_name,
    st.trip_id,
    st.stop_sequence,
    st.departure_time,
    t.route_id,
    r.route_long_name,
    r.route_short_name,
    t.service_id
FROM stop_times st
JOIN stops s ON s.stop_id = st.stop_id
JOIN trips t ON t.trip_id = st.trip_id
JOIN routes r ON r.route_id = t.route_id
;

CREATE OR REPLACE VIEW v_arrivals AS
SELECT
    s.stop_name,
    st.trip_id,
    st.stop_sequence,
    st.arrival_time,
    t.route_id,
    r.route_long_name,
    r.route_short_name,
    t.service_id
FROM stop_times st
JOIN stops s ON s.stop_id = st.stop_id
JOIN trips t ON t.trip_id = st.trip_id
JOIN routes r ON r.route_id = t.route_id
;

CREATE OR REPLACE VIEW v_trip_stops AS
SELECT
    st.trip_id,
    st.stop_sequence,
    s.stop_name
FROM stop_times st
JOIN stops s ON s.stop_id = st.stop_id;

CREATE OR REPLACE VIEW v_agency_activity AS
SELECT
    a.agency_id,
    a.agency_name,
    COUNT(t.trip_id) AS trip_count
FROM agency a
JOIN routes r ON a.agency_id = r.agency_id
JOIN trips t ON r.route_id = t.route_id
GROUP BY a.agency_id, a.agency_name
HAVING COUNT(t.trip_id) > 0;

CREATE OR REPLACE VIEW v_route_trip_count AS
SELECT
    r.route_id,
    r.route_short_name,
    r.route_long_name,
    COUNT(t.trip_id) AS trip_count
FROM routes r
JOIN trips t ON r.route_id = t.route_id
GROUP BY r.route_id, r.route_short_name, r.route_long_name
HAVING COUNT(t.trip_id) > 10;

