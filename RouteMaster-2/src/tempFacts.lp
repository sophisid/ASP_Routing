route(r1).
distance(r1, 389.5).
time(r1, 77.2).
route_score(r1, 543.9) :- route(r1), distance(r1, 389.5), time(r1, 77.2).
node("t56_0").
latitude("t56_0", "35.33575689238992").
longitude("t56_0", "25.159420175884783").
demand(t56_0, 1).
node("t3_0").
latitude("t3_0", "35.3364221").
longitude("t3_0", "25.160539").
demand(t3_0, 1).
node("t67_0").
latitude("t67_0", "35.33557738933236").
longitude("t67_0", "25.162014823829256").
demand(t67_0, 1).
distance(t56, t3, 126).
distance(t3, t56, 126).
distance(t56, t67, 236).
distance(t67, t56, 236).
distance(t3, t67, 164).
distance(t67, t3, 164).
