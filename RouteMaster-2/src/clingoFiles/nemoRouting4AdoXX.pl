% Score
weight_duration(2). % Weight for duration
weight_distance(1). % Weight for distance
weight_elevation_gain(1).   % Penalty for uphill routes
weight_elevation_loss(-0.5). % bonus for downhill
penalty_air_pollution(-1). % Penalty for air pollution score
bonus_smartway_elite(10). % Bonus for "ELITE" smartway vehicles

% Node and vehicle definitions
node(X) :- latitude(X, _), longitude(X, _).
vehicle(X) :- 
    transmission(X, _), fuel(X, _), air_pollution_score(X, _), display(X, _),
    cyl(X, _), drive(X, _), stnd(X, _), stnd_description(X, _), 
    cert_region(X, _), underhood_id(X, _), veh_class(X, _), 
    city_mpg(X, _), hwy_mpg(X, _), cmb_mpg(X, _), 
    greenhouse_gas_score(X, _), smartway(X, _), price_eur(X, _).
friendly_environment(X) :- vehicle(X), air_pollution_score(X, Score), Score <= 7.
is_smartway_elite(X, 1) :- smartway(X, "ELITE").
is_smartway_elite(X, 0) :- smartway(X, S), S \= "ELITE".

vehicle_score(V, Total) :-
    vehicle(V),
    air_pollution_score(V, APS),
    city_mpg(V, CMPG),
    hwy_mpg(V, HMPG),
    cmb_mpg(V, CBMPG),
    greenhouse_gas_score(V, GGS),
    smartway(V, S),
    penalty_air_pollution(PAP),
    bonus_smartway_elite(Bonus),
    is_smartway_elite(V, BonusMultiplier),
    BonusAmount = Bonus * BonusMultiplier,
    Total = APS * PAP + CMPG + HMPG + CBMPG - GGS + BonusAmount.


% Maximum vehicle score
max_vehicle_score(Max) :- Max = #max { Total : vehicle_score(_, Total) }.
best_vehicle(V) :- vehicle_score(V, Total), max_vehicle_score(Total).

% Route scoring logic
route_score(R, Total) :-
    route(R),
    distance(R, D),
    time(R, T),
    elevation_gain(R, EG),
    elevation_loss(R, EL),
    weight_duration(WD),
    weight_distance(WDist),
    weight_elevation_gain(WEG),
    weight_elevation_loss(WEL),
    Total = WD * T + WDist * D + WEG * EG + WEL * EL.


% Best route
min_route_score(Min) :- Min = #min { Total : route_score(_, Total) }.
best_route(R) :- route_score(R, Total), min_route_score(Total).

% TSP problem
visit_once(N):- node(N), reached(N).
start_and_end_at(N):- start_node(N).
cycle(N, N) :- start_and_end_at(N).
total_cost(TotalCost) :- 
  findall(Cost, (cycle(A,B), cost(RouteId, A,B, Cost)), Costs), 
  sum_list(Costs, TotalCost).
#minimize{ TotalCost : total_cost(TotalCost) }.
:- node(N), not reached(N).

reached(To) :- cycle(From, To), reached(From).
reached(Start) :- start_and_end_at(Start), cycle(Start, _).
:- cycle(From1, To), cycle(From2, To), From1 \= From2.