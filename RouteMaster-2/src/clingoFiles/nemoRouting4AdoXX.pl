node(X) :- latitude(X, _), longitude(X,_).
vehicle(X) :- transmission(X, _), fuel(X, _), air_pollution_score(X, _), display(X, _), cyl(X, _), drive(X, _), stnd(X, _), stnd_description(X, _), cert_region(X, _), transmission(X, _), underhood_id(X, _), veh_class(X, _), city_mpg(X, _), hwy_mpg(X, _), cmb_mpg(X, _), greenhouse_gas_score(X, _), smartway(X, _), price_eur(X, _). 
