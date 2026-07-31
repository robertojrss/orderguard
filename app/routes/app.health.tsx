import { requireFeature } from "../services/feature-access.server";

import type {
  ActionFunctionArgs,
  LoaderFunctionArgs
} from "react-router";

import {
  useFetcher
} from "react-router";

import {
  useState
} from "react";

import {
  authenticate
} from "../shopify.server";

import {
  buildHealthReport
} from "../services/health-checker.server";

import OrderFilters from "../components/OrderFilters";



export const loader =
async ({
 request
}:LoaderFunctionArgs)=>{

 await authenticate.admin(request);

 return null;

};





export const action =
async ({
 request
}:ActionFunctionArgs)=>{


 const ctx =
 await requireFeature({
  request,
  feature: "health",
 });


 const formData =
  await request.formData();



 const limit =
 Number(
  formData.get("limit") ?? 250
 );


 const lastDaysValue =
 formData.get("lastDays");


 const lastDays =
 lastDaysValue
 ?
 Number(lastDaysValue)
 :
 undefined;



 const report =
 await buildHealthReport(
  ctx.admin,
  {
   limit,
   lastDays
  }
 );



 await ctx.finish(
  report.totalOrders
 );



 return {
  type:"scan" as const,
  ...report
 };

};





function statusLabel(
 status:string
){

 if(status==="healthy")
  return "Healthy";

 if(status==="attention")
  return "Needs Attention";


 return "Critical";

}





function statusEmoji(
 status:string
){

 if(status==="healthy")
  return "🟢";

 if(status==="attention")
  return "🟡";


 return "🔴";

}





export default function HealthPage(){


const [
 filters,
 setFilters
] =
useState<{
 limit:number;
 lastDays?:number;
}>({

 limit:250

});



const fetcher =
useFetcher<typeof action>();



const loading =
fetcher.state !== "idle";



const data =
fetcher.data?.type==="scan"
?
fetcher.data
:
null;



return (

<s-page heading="Store Health">



<s-section heading="🏥 Store Health Checker">


<div
style={{
padding:"24px",
background:"#f6f6f7",
borderRadius:"14px"
}}
>


<h1
style={{
fontSize:"28px",
marginBottom:"8px"
}}
>
Analyze your store reliability
</h1>



<p
style={{
fontSize:"15px",
lineHeight:"1.5",
maxWidth:"700px"
}}
>
Find hidden operational risks in your orders,
customer data, emails, phone numbers and
shipping addresses.
</p>




<div
style={{
marginTop:"20px"
}}
>


<OrderFilters

values={filters}

onChange={setFilters}

/>


</div>




<fetcher.Form method="post">


<input
type="hidden"
name="limit"
value={filters.limit}
/>


<input
type="hidden"
name="lastDays"
value={filters.lastDays ?? ""}
/>



<s-button
type="submit"
disabled={loading}
>

{
loading
?
"Scanning store..."
:
"Run Health Check"
}

</s-button>


</fetcher.Form>


</div>


</s-section>





{
data &&

<>



<s-section heading="Store Health Score">


<div
style={{
display:"flex",
alignItems:"center",
justifyContent:"space-between",
padding:"30px",
border:"1px solid #e1e3e5",
borderRadius:"14px"
}}
>



<div>


<div
style={{
display:"flex",
alignItems:"baseline",
gap:"8px"
}}
>


<span
style={{
fontSize:"64px",
fontWeight:800,
lineHeight:1
}}
>
{data.score}
</span>


<span
style={{
fontSize:"28px",
color:"#6d7175",
fontWeight:600
}}
>
/100
</span>


</div>



<p
style={{
fontSize:"18px",
marginTop:"10px"
}}
>

{
statusEmoji(data.status)
}

{" "}

{
statusLabel(data.status)
}


</p>


</div>




<div
style={{
textAlign:"right"
}}
>


<p>
Orders analyzed
</p>


<strong
style={{
fontSize:"24px"
}}
>
{data.totalOrders}
</strong>


<p
style={{
marginTop:"10px"
}}
>
{data.highIssues} high
<br/>
{data.mediumIssues} medium
<br/>
{data.lowIssues} low
</p>



</div>



</div>



</s-section>





<s-section heading="Health Categories">



<div
style={{
display:"grid",
gridTemplateColumns:
"repeat(auto-fit,minmax(280px,1fr))",
gap:"16px"
}}
>



{
Object.entries(data.categories)
.map(
([
name,
category
])=>(


<div
key={name}
style={{
border:"1px solid #e1e3e5",
borderRadius:"12px",
padding:"20px",
background:"#fff"
}}
>


<h3
style={{
marginBottom:"12px"
}}
>
{name.toUpperCase()}
</h3>



<div
style={{
fontSize:"34px",
fontWeight:700
}}
>
{category.score}
<span
style={{
fontSize:"18px",
color:"#6d7175"
}}
>
 %
</span>
</div>



<p
style={{
marginTop:"8px"
}}
>

{
category.issueCount === 0
?
"✓ No issues found"
:
`${category.issueCount} issues found`
}


</p>




{
category.findings.map(
(issue,index)=>(


<div
key={index}
style={{
marginTop:"16px",
paddingTop:"16px",
borderTop:"1px solid #eee"
}}
>


<strong>
{issue.title}
</strong>


<p
style={{
marginTop:"8px"
}}
>
{issue.description}
</p>



<div
style={{
marginTop:"10px"
}}
>

<strong>
Business impact
</strong>

<ul
style={{
marginTop:"6px",
paddingLeft:"18px"
}}
>

{
issue.businessImpact.map(
(text,index)=>(
<li key={index}>
{text}
</li>
))
}

</ul>

<p
style={{
marginTop:"10px"
}}
>

<strong>
Suggested action:
</strong>

{" "}

{issue.suggestedAction}

</p>

</div>


</div>


))
}



</div>


))


}



</div>


</s-section>


</>

}



</s-page>

);

}