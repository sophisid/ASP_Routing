% Facts: Reviewers and research papers
reviewer(r1).
reviewer(r2).
reviewer(r3).
reviewer(r4).

research_paper(p1).
research_paper(p2).
research_paper(p3).
research_paper(p4).
research_paper(p5).
research_paper(p6).
research_paper(p7).
research_paper(p8).
research_paper(p9).
research_paper(p10).
research_paper(p11).
research_paper(p12).
research_paper(p13).
research_paper(p14).
% if i exceed the 16-17 papers, the program will brake because it does not have enough reviewers to review all the papers, and the rules will be violated.

% Generate possible assignments
{ assignment(Reviewer, Paper) } :- reviewer(Reviewer), research_paper(Paper).

% Explicitly include the empty set
empty_set :- not assignment(_, _).

% Constraint: No reviewer can be assigned more than 7 papers
:- reviewer(Reviewer), #count { Paper : assignment(Reviewer, Paper) } > 7.

:- research_paper(Paper), 
    #count { Reviewer : assignment(Reviewer, Paper) } != 2,
    #count { Reviewer : assignment(Reviewer, Paper) } != 3.

