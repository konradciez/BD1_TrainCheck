
-- Custom validation triggers for GTFS tables

DELIMITER $$

DROP TRIGGER IF EXISTS trg_trips_no_duplicate $$
CREATE TRIGGER trg_trips_no_duplicate
BEFORE INSERT ON trips
FOR EACH ROW
BEGIN
	IF EXISTS (SELECT 1 FROM trips t WHERE t.trip_id = NEW.trip_id LIMIT 1) THEN
		SIGNAL SQLSTATE '45000'
			SET MESSAGE_TEXT = 'Trip already exists (trip_id)';
	END IF;
END $$

DROP TRIGGER IF EXISTS trg_stop_times_validate $$
CREATE TRIGGER trg_stop_times_validate
BEFORE INSERT ON stop_times
FOR EACH ROW
BEGIN
	DECLARE prev_dep TIME;

	-- (2) stop_id must exist in stops
	IF NOT EXISTS (SELECT 1 FROM stops s WHERE s.stop_id = NEW.stop_id LIMIT 1) THEN
		SIGNAL SQLSTATE '45000'
			SET MESSAGE_TEXT = 'stop_id does not exist in stops';
	END IF;

	-- (3) Ensure time increases with stop_sequence within the same trip
	-- This makes sure that for a 2-stop custom trip: time_start < time_end.
	IF NEW.stop_sequence > 1 THEN
		SELECT st.departure_time
		INTO prev_dep
		FROM stop_times st
		WHERE st.trip_id = NEW.trip_id
		  AND st.stop_sequence = NEW.stop_sequence - 1
		LIMIT 1;

		IF prev_dep IS NOT NULL AND TIME_TO_SEC(NEW.departure_time) <= TIME_TO_SEC(prev_dep) THEN
			SIGNAL SQLSTATE '45000'
				SET MESSAGE_TEXT = 'stop_times must have increasing times by stop_sequence';
		END IF;
	END IF;
END $$

DELIMITER ;

