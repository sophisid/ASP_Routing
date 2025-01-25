node(X) :- latitude(X, _), longitude(X, _).
vehicle(X) :- transmission(X, _), fuel(X, _), air_pollution_score(X, _), display(X, _), cyl(X, _), drive(X, _), stnd(X, _), stnd_description(X, _), cert_region(X, _), transmission(X, _), underhood_id(X, _), veh_class(X, _), city_mpg(X, _), hwy_mpg(X, _), cmb_mpg(X, _), greenhouse_gas_score(X, _), smartway(X, _), price_eur(X, _). 
friendly_environment(X) :- vehicle(X), air_pollution_score(X, Score), Score <= 7.
vehicle_score(V, Total) :-
    vehicle(V),
    air_pollution_score(V, APS),
    city_mpg(V, CMPG),
    hwy_mpg(V, HMPG),
    cmb_mpg(V, CBMPG),
    greenhouse_gas_score(V, GGS),
    smartway(V, S),
    Bonus = 10 * (S = "ELITE"),
    Total = APS*(-1) + CMPG + HMPG
    + CBMPG + GGS*(-1) + Bonus.
max_vehicle_score(Max) :- Max = #max
{ Total : vehicle_score(_, Total)}.

best_vehicle(V) :- vehicle_score(V, Total), max_vehicle_score(Total).

% Prioritize duration over distance 
route_score(R, Total) :-
    route(R),
    distance(R, D),
    time(R, T),
    Total = (2 * T + D).

min_vehicle_score(Min) :- Min = #min
{ Total : route_score(_, Total) }.

best_route(R) := vehicle_score(R, Total), min_vehicle_score(Total).
