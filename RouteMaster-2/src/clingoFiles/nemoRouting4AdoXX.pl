%--------------------------------------------------
% 1. Basic Facts: node(X), vehicle(V), distance(X,Y,D)
%    (Will come from your generated facts)
%--------------------------------------------------

%--------------------------------------------------
% 2. Each node must be visited exactly once by exactly one vehicle
%    We'll define route(V, A, B) meaning "Vehicle V goes directly from A to B."
%--------------------------------------------------

1 { route(V, A, B) : vehicle(V), node(B), B != A } 1 :- node(A).
1 { route(V, B, A) : vehicle(V), node(B), B != A } 1 :- node(A).

%--------------------------------------------------
% 3. Only allow route(V,A,B) if distance(A,B,_) is known
%--------------------------------------------------
:- route(V, A, B), not distance(A,B,_).

%--------------------------------------------------
% 4. Capacity constraints: sum(demands) on route <= capacity
%    If your VRP requires capacity constraints, you'd do something like:
%    We'll do a simplified version here, but in practice you might 
%    track who visits which nodes, then sum demands.
%--------------------------------------------------

% For each node A, define servedBy(A, V) if route(V, X, A) or route(V, A, X) for some X, 
% meaning V visits A. Then ensure sum(demand(A)) <= capacity(V).
% (This can get more complicated with real VRP, but here's the conceptual idea)

servedBy(A, V) :- route(V, A, B).
servedBy(A, V) :- route(V, B, A).

#sum { D,A : demand(A, D), servedBy(A, V) } <= C :- capacity(V, C).

%--------------------------------------------------
% 5. Cost Minimization
%    We define cost(V, A, B, D) if route(V, A, B) and distance(A,B,D).
%    Then minimize the sum of all distances used.
%--------------------------------------------------

cost(V,A,B,D) :- route(V,A,B), distance(A,B,D).

#minimize { D,@1 : cost(_,_,_,D) }.

%--------------------------------------------------
% 6. Show results
%--------------------------------------------------
#show route/3.
