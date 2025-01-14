%----------------------------------------------------------------------
% 1. Basic Facts placeholders
%    (In practice, you either paste them here or load them from a separate file.)
%----------------------------------------------------------------------
% node(a). node(b). node(c).
% vehicle(v1). vehicle(v2).
% distance(a,b,10). distance(b,a,10).
% distance(a,c,12). distance(c,a,12).
% distance(b,c,3).  distance(c,b,3).
% capacity(v1, 10). capacity(v2, 10).
% demand(a,2). demand(b,3). demand(c,1).
%
% For a real scenario, you might have them in "facts.lp" or generate them dynamically.

%----------------------------------------------------------------------
% 2. Definitions: route(V, A, B) means "Vehicle V goes directly from A to B"
%    We want each node to have exactly 1 arc out, 1 arc in (like TSP).
%----------------------------------------------------------------------
% For every node A, choose exactly one route(V,A,B) with B != A
1 { route(V, A, B) : vehicle(V), node(B), B != A } 1 :- node(A).
% For every node A, choose exactly one route(V,B,A) with B != A
1 { route(V, B, A) : vehicle(V), node(B), B != A } 1 :- node(A).

% Only allow route(V,A,B) if distance(A,B,D) is known
:- route(V,A,B), not distance(A,B,_).

%----------------------------------------------------------------------
% 3. Sub-tour Elimination
%    Because 1-in/1-out per node can form multiple small cycles otherwise,
%    we need to ensure that all nodes a vehicle visits form a single connected tour
%    or that each node is in a route that is reachable from some "depot."
%----------------------------------------------------------------------
% Approach: If you have a single depot node "depot(d)" or something, you can do:
%    reachable(V, X) if route(V, d, X), or if route(V, A, X) with A reachable.
%    Then forbid any node from being un-reachable if it's in that vehicle's route.
%
% If you have multiple vehicles, each with a distinct depot, then define depot(V, D).
% For demonstration, let's assume a single depot = 'd'.

depot(d).  % Mark 'd' as the single depot node

% A node X is reachable by vehicle V if:
%   - route(V, d, X) (directly from depot)
%   - or route(V, A, X) for some A that is already reachable by V
reachable(V, X) :- route(V, d, X).
reachable(V, X) :- route(V, A, X), reachable(V, A).

% It's possible that multiple vehicles exist. So we only forbid a node from
% being un-reachable if that node is actually served by some route(V, _, X) or route(V, X, _).
servedBy(X, V) :- route(V, X, Y).
servedBy(X, V) :- route(V, Y, X).

% Now forbid "X is served by V but not reachable by V"
:- servedBy(X, V), not reachable(V, X), node(X), X != d.

%----------------------------------------------------------------------
% 4. Capacity constraints (optional if you have demands)
%----------------------------------------------------------------------
servedByNode(X, V) :- route(V, X, Y).  % X is served by V if V goes from X->Y
servedByNode(X, V) :- route(V, Y, X).  % or Y->X

#sum { DEMAND, N : demand(N, DEMAND), servedByNode(N, V) } <= CAP :- capacity(V, CAP).

%----------------------------------------------------------------------
% 5. Cost Minimization: sum of distances
%----------------------------------------------------------------------
cost(V,A,B,D) :- route(V,A,B), distance(A,B,D).

#minimize { D,@1 : cost(_,_,_,D) }.

%----------------------------------------------------------------------
% 6. Show final routes
%----------------------------------------------------------------------
#show route/3.
