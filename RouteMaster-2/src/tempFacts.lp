
% ------------------------------------------------------
% Score Weights & Penalties
weight_duration(2).
weight_distance(1).
penalty_air_pollution(-1).
bonus_smartway_elite(10).

% ------------------------------------------------------
% Node & Vehicle definitions
node(X) :- latitude(X, _), longitude(X, _).
vehicle(X) :-
    transmission(X, _), fuel(X, _), air_pollution_score(X, _), display(X, _),
    cyl(X, _), drive(X, _), stnd(X, _), stnd_description(X, _),
    cert_region(X, _), underhood_id(X, _), veh_class(X, _),
    city_mpg(X, _), hwy_mpg(X, _), cmb_mpg(X, _),
    greenhouse_gas_score(X, _), smartway(X, _), price_eur(X, _).

friendly_environment(X) :- vehicle(X), air_pollution_score(X, Score), Score <= 7.

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
    BonusAmount = Bonus * (S = "ELITE"),
    Total = APS * PAP + CMPG + HMPG + CBMPG - GGS + BonusAmount.

max_vehicle_score(Max) :- Max = #max { Total : vehicle_score(_, Total)}.
best_vehicle(V) :- vehicle_score(V, Total), max_vehicle_score(Total).

route_score(R, Total) :-
    route(R),
    distance(R, D),
    time(R, T),
    weight_duration(WD),
    weight_distance(WDist),
    Total = WD * T + WDist * D.

min_route_score(Min) :- Min = #min { Total : route_score(_, Total)}.
best_route(R) :- route_score(R, Total), min_route_score(Total).
% ------------------------------------------------------
route(r1).
distance(r1, 652.7).
time(r1, 99.3).
route_score(r1, 851.3000000000001) :- route(r1), distance(r1, 652.7), time(r1, 99.3).
node("node_3_0").
latitude("node_3_0", "35.3376482").
longitude("node_3_0", "25.1634345").
demand(node_3_0, 1).
node("node_33_0").
latitude("node_33_0", "35.33726254957135").
longitude("node_33_0", "25.160067060832166").
demand(node_33_0, 1).
node("node_333_0").
latitude("node_333_0", "35.3371479540701").
longitude("node_333_0", "25.16106559450606").
demand(node_333_0, 1).
vehicle("vehicle_0").
fuel("vehicle_0", "Electricity").
air_pollution_score(vehicle_0, 10).
transmission("vehicle_0", "Auto-1").
underhood_id("vehicle_0", "SHYXV00.0W04").
veh_class("vehicle_0", "small SUV").
city_mpg(vehicle_0, 84).
hwy_mpg(vehicle_0, 72).
cmb_mpg(vehicle_0, 78).
greenhouse_gas_score(vehicle_0, 10).
smartway("vehicle_0", "Elite").
price_eur(vehicle_0, 32200).
stnd("vehicle_0", "T3B0").
stnd_description("vehicle_0", "Federal Tier 3 Bin 0").
cert_region("vehicle_0", "FA").
vehicle_score(vehicle_0, 214) :- vehicle(vehicle_0), air_pollution_score(vehicle_0, 10), city_mpg(vehicle_0, 84), hwy_mpg(vehicle_0, 72), cmb_mpg(vehicle_0, 78), greenhouse_gas_score(vehicle_0, 10).
vehicle("vehicle_1").
fuel("vehicle_1", "Electricity").
air_pollution_score(vehicle_1, 10).
transmission("vehicle_1", "Auto-1").
underhood_id("vehicle_1", "SLMUV00.0ZA2").
veh_class("vehicle_1", "large car").
city_mpg(vehicle_1, 129).
hwy_mpg(vehicle_1, 126).
cmb_mpg(vehicle_1, 128).
greenhouse_gas_score(vehicle_1, 10).
smartway("vehicle_1", "Elite").
price_eur(vehicle_1, 27600).
stnd("vehicle_1", "T3B0").
stnd_description("vehicle_1", "Federal Tier 3 Bin 0").
cert_region("vehicle_1", "CA").
vehicle_score(vehicle_1, 363) :- vehicle(vehicle_1), air_pollution_score(vehicle_1, 10), city_mpg(vehicle_1, 129), hwy_mpg(vehicle_1, 126), cmb_mpg(vehicle_1, 128), greenhouse_gas_score(vehicle_1, 10).
vehicle("vehicle_2").
fuel("vehicle_2", "Electricity").
air_pollution_score(vehicle_2, 10).
transmission("vehicle_2", "Auto-1").
underhood_id("vehicle_2", "SLMUV00.0NR1").
veh_class("vehicle_2", "large car").
city_mpg(vehicle_2, 149).
hwy_mpg(vehicle_2, 142).
cmb_mpg(vehicle_2, 146).
greenhouse_gas_score(vehicle_2, 10).
smartway("vehicle_2", "Elite").
price_eur(vehicle_2, 27600).
stnd("vehicle_2", "T3B0").
stnd_description("vehicle_2", "Federal Tier 3 Bin 0").
cert_region("vehicle_2", "FA").
vehicle_score(vehicle_2, 417) :- vehicle(vehicle_2), air_pollution_score(vehicle_2, 10), city_mpg(vehicle_2, 149), hwy_mpg(vehicle_2, 142), cmb_mpg(vehicle_2, 146), greenhouse_gas_score(vehicle_2, 10).
vehicle("vehicle_3").
fuel("vehicle_3", "Electricity").
air_pollution_score(vehicle_3, 10).
transmission("vehicle_3", "Auto-1").
underhood_id("vehicle_3", "SMAXT00.0182").
veh_class("vehicle_3", "small SUV").
city_mpg(vehicle_3, 80).
hwy_mpg(vehicle_3, 70).
cmb_mpg(vehicle_3, 75).
greenhouse_gas_score(vehicle_3, 10).
smartway("vehicle_3", "Elite").
price_eur(vehicle_3, 32200).
stnd("vehicle_3", "T3B0").
stnd_description("vehicle_3", "Federal Tier 3 Bin 0").
cert_region("vehicle_3", "FA").
vehicle_score(vehicle_3, 205) :- vehicle(vehicle_3), air_pollution_score(vehicle_3, 10), city_mpg(vehicle_3, 80), hwy_mpg(vehicle_3, 70), cmb_mpg(vehicle_3, 75), greenhouse_gas_score(vehicle_3, 10).
vehicle("vehicle_4").
fuel("vehicle_4", "Electricity").
air_pollution_score(vehicle_4, 10).
transmission("vehicle_4", "Auto-1").
underhood_id("vehicle_4", "SMBXV00.0ED1").
veh_class("vehicle_4", "station wagon").
city_mpg(vehicle_4, 98).
hwy_mpg(vehicle_4, 87).
cmb_mpg(vehicle_4, 93).
greenhouse_gas_score(vehicle_4, 10).
smartway("vehicle_4", "Elite").
price_eur(vehicle_4, 23000).
stnd("vehicle_4", "T3B0").
stnd_description("vehicle_4", "Federal Tier 3 Bin 0").
cert_region("vehicle_4", "FA").
vehicle_score(vehicle_4, 258) :- vehicle(vehicle_4), air_pollution_score(vehicle_4, 10), city_mpg(vehicle_4, 98), hwy_mpg(vehicle_4, 87), cmb_mpg(vehicle_4, 93), greenhouse_gas_score(vehicle_4, 10).
vehicle("vehicle_5").
fuel("vehicle_5", "Electricity").
air_pollution_score(vehicle_5, 10).
transmission("vehicle_5", "Auto-2").
underhood_id("vehicle_5", "SPRXV00.0ETT").
veh_class("vehicle_5", "small car").
city_mpg(vehicle_5, 94).
hwy_mpg(vehicle_5, 92).
cmb_mpg(vehicle_5, 93).
greenhouse_gas_score(vehicle_5, 10).
smartway("vehicle_5", "Elite").
price_eur(vehicle_5, 18400).
stnd("vehicle_5", "T3B0").
stnd_description("vehicle_5", "Federal Tier 3 Bin 0").
cert_region("vehicle_5", "FA").
vehicle_score(vehicle_5, 259) :- vehicle(vehicle_5), air_pollution_score(vehicle_5, 10), city_mpg(vehicle_5, 94), hwy_mpg(vehicle_5, 92), cmb_mpg(vehicle_5, 93), greenhouse_gas_score(vehicle_5, 10).
vehicle("vehicle_6").
fuel("vehicle_6", "Electricity").
air_pollution_score(vehicle_6, 10).
transmission("vehicle_6", "Auto-1").
underhood_id("vehicle_6", "SVVXV00.0Z0B").
veh_class("vehicle_6", "small SUV").
city_mpg(vehicle_6, 118).
hwy_mpg(vehicle_6, 94).
cmb_mpg(vehicle_6, 106).
greenhouse_gas_score(vehicle_6, 10).
smartway("vehicle_6", "Elite").
price_eur(vehicle_6, 32200).
stnd("vehicle_6", "T3B0").
stnd_description("vehicle_6", "Federal Tier 3 Bin 0").
cert_region("vehicle_6", "FA").
vehicle_score(vehicle_6, 298) :- vehicle(vehicle_6), air_pollution_score(vehicle_6, 10), city_mpg(vehicle_6, 118), hwy_mpg(vehicle_6, 94), cmb_mpg(vehicle_6, 106), greenhouse_gas_score(vehicle_6, 10).
vehicle("vehicle_7").
fuel("vehicle_7", "Electricity").
air_pollution_score(vehicle_7, 10).
transmission("vehicle_7", "Auto-1").
underhood_id("vehicle_7", "SVGAT00.0AZE").
veh_class("vehicle_7", "standard SUV").
city_mpg(vehicle_7, 73).
hwy_mpg(vehicle_7, 75).
cmb_mpg(vehicle_7, 74).
greenhouse_gas_score(vehicle_7, 10).
smartway("vehicle_7", "Elite").
price_eur(vehicle_7, 46000).
stnd("vehicle_7", "T3B0").
stnd_description("vehicle_7", "Federal Tier 3 Bin 0").
cert_region("vehicle_7", "FA").
vehicle_score(vehicle_7, 202) :- vehicle(vehicle_7), air_pollution_score(vehicle_7, 10), city_mpg(vehicle_7, 73), hwy_mpg(vehicle_7, 75), cmb_mpg(vehicle_7, 74), greenhouse_gas_score(vehicle_7, 10).
vehicle("vehicle_8").
fuel("vehicle_8", "Electricity").
air_pollution_score(vehicle_8, 10).
transmission("vehicle_8", "Auto-1").
underhood_id("vehicle_8", "SVGAT00.0B6B").
veh_class("vehicle_8", "standard SUV").
city_mpg(vehicle_8, 96).
hwy_mpg(vehicle_8, 82).
cmb_mpg(vehicle_8, 89).
greenhouse_gas_score(vehicle_8, 10).
smartway("vehicle_8", "Elite").
price_eur(vehicle_8, 46000).
stnd("vehicle_8", "T3B0").
stnd_description("vehicle_8", "Federal Tier 3 Bin 0").
cert_region("vehicle_8", "FA").
vehicle_score(vehicle_8, 247) :- vehicle(vehicle_8), air_pollution_score(vehicle_8, 10), city_mpg(vehicle_8, 96), hwy_mpg(vehicle_8, 82), cmb_mpg(vehicle_8, 89), greenhouse_gas_score(vehicle_8, 10).
vehicle("vehicle_9").
fuel("vehicle_9", "Electricity").
air_pollution_score(vehicle_9, 10).
transmission("vehicle_9", "Auto-1").
underhood_id("vehicle_9", "SVGAT00.0AZS").
veh_class("vehicle_9", "standard SUV").
city_mpg(vehicle_9, 68).
hwy_mpg(vehicle_9, 72).
cmb_mpg(vehicle_9, 70).
greenhouse_gas_score(vehicle_9, 10).
smartway("vehicle_9", "Elite").
price_eur(vehicle_9, 46000).
stnd("vehicle_9", "T3B0").
stnd_description("vehicle_9", "Federal Tier 3 Bin 0").
cert_region("vehicle_9", "FA").
vehicle_score(vehicle_9, 190) :- vehicle(vehicle_9), air_pollution_score(vehicle_9, 10), city_mpg(vehicle_9, 68), hwy_mpg(vehicle_9, 72), cmb_mpg(vehicle_9, 70), greenhouse_gas_score(vehicle_9, 10).
vehicle("vehicle_10").
fuel("vehicle_10", "Electricity").
air_pollution_score(vehicle_10, 10).
transmission("vehicle_10", "Auto-1").
underhood_id("vehicle_10", "SBMXV00.0G2X").
veh_class("vehicle_10", "small car").
city_mpg(vehicle_10, 89).
hwy_mpg(vehicle_10, 91).
cmb_mpg(vehicle_10, 90).
greenhouse_gas_score(vehicle_10, 10).
smartway("vehicle_10", "Elite").
price_eur(vehicle_10, 18400).
stnd("vehicle_10", "T3B0").
stnd_description("vehicle_10", "Federal Tier 3 Bin 0").
cert_region("vehicle_10", "FA").
vehicle_score(vehicle_10, 250) :- vehicle(vehicle_10), air_pollution_score(vehicle_10, 10), city_mpg(vehicle_10, 89), hwy_mpg(vehicle_10, 91), cmb_mpg(vehicle_10, 90), greenhouse_gas_score(vehicle_10, 10).
vehicle("vehicle_11").
fuel("vehicle_11", "Electricity").
air_pollution_score(vehicle_11, 10).
transmission("vehicle_11", "Auto-1").
underhood_id("vehicle_11", "SBMXV00.0G2S").
veh_class("vehicle_11", "small car").
city_mpg(vehicle_11, 104).
hwy_mpg(vehicle_11, 105).
cmb_mpg(vehicle_11, 105).
greenhouse_gas_score(vehicle_11, 10).
smartway("vehicle_11", "Elite").
price_eur(vehicle_11, 18400).
stnd("vehicle_11", "T3B0").
stnd_description("vehicle_11", "Federal Tier 3 Bin 0").
cert_region("vehicle_11", "FA").
vehicle_score(vehicle_11, 294) :- vehicle(vehicle_11), air_pollution_score(vehicle_11, 10), city_mpg(vehicle_11, 104), hwy_mpg(vehicle_11, 105), cmb_mpg(vehicle_11, 105), greenhouse_gas_score(vehicle_11, 10).
vehicle("vehicle_12").
fuel("vehicle_12", "Electricity").
air_pollution_score(vehicle_12, 10).
transmission("vehicle_12", "Auto-1").
underhood_id("vehicle_12", "SBMXJ00.0I2T").
veh_class("vehicle_12", "large car").
city_mpg(vehicle_12, 72).
hwy_mpg(vehicle_12, 79).
cmb_mpg(vehicle_12, 75).
greenhouse_gas_score(vehicle_12, 10).
smartway("vehicle_12", "Elite").
price_eur(vehicle_12, 27600).
stnd("vehicle_12", "T3B0").
stnd_description("vehicle_12", "Federal Tier 3 Bin 0").
cert_region("vehicle_12", "FA").
vehicle_score(vehicle_12, 206) :- vehicle(vehicle_12), air_pollution_score(vehicle_12, 10), city_mpg(vehicle_12, 72), hwy_mpg(vehicle_12, 79), cmb_mpg(vehicle_12, 75), greenhouse_gas_score(vehicle_12, 10).
vehicle("vehicle_13").
fuel("vehicle_13", "Electricity").
air_pollution_score(vehicle_13, 10).
transmission("vehicle_13", "Auto-1").
underhood_id("vehicle_13", "SHYXV00.0302").
veh_class("vehicle_13", "small SUV").
city_mpg(vehicle_13, 97).
hwy_mpg(vehicle_13, 82).
cmb_mpg(vehicle_13, 90).
greenhouse_gas_score(vehicle_13, 10).
smartway("vehicle_13", "Elite").
price_eur(vehicle_13, 32200).
stnd("vehicle_13", "T3B0").
stnd_description("vehicle_13", "Federal Tier 3 Bin 0").
cert_region("vehicle_13", "FA").
vehicle_score(vehicle_13, 249) :- vehicle(vehicle_13), air_pollution_score(vehicle_13, 10), city_mpg(vehicle_13, 97), hwy_mpg(vehicle_13, 82), cmb_mpg(vehicle_13, 90), greenhouse_gas_score(vehicle_13, 10).
distance(unknown, unknown, 308).
distance(unknown, unknown, 308).
distance(unknown, unknown, 222).
distance(unknown, unknown, 222).
distance(unknown, unknown, 91).
distance(unknown, unknown, 91).
