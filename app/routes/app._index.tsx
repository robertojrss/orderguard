import { Link } from "react-router";

export default function Index() {
  return (
    <s-page heading="Order Repair">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "20px",
        }}
      >

        <s-section heading="🪪 Brazilian CPF/CNPJ Repair">
          <s-paragraph>
            Copies CPF/CNPJ from localizedFields into the Company field to
            improve shipping and customer data compatibility.
          </s-paragraph>

          <div style={{ marginTop: 16 }}>
            <Link to="/app/cpf">
              <s-button>Open module</s-button>
            </Link>
          </div>
        </s-section>



        <s-section heading="📞 Phone Formatter">
          <s-paragraph>
            Normalizes customer phone numbers into international formats
            accepted by shipping providers.
          </s-paragraph>

          <div style={{ marginTop: 16 }}>
            <Link to="/app/phone">
              <s-button>Open module</s-button>
            </Link>
          </div>
        </s-section>



        <s-section heading="📍 Address Formatter">
          <s-paragraph>
            Cleans and formats shipping addresses, including spacing issues,
            complements, and country-specific formatting rules.
          </s-paragraph>

          <div style={{ marginTop: 16 }}>
            <Link to="/app/address">
              <s-button>Open module</s-button>
            </Link>
          </div>
        </s-section>



        <s-section heading="📦 ZIP Code Repair">
          <s-paragraph>
            Normalizes postal/ZIP codes into country-standard formats to
            improve shipping label generation.
          </s-paragraph>

          <div style={{ marginTop: 16 }}>
            <Link to="/app/zip">
              <s-button>Open module</s-button>
            </Link>
          </div>
        </s-section>



        <s-section heading="📧 Email Validator">
          <s-paragraph>
            Detects typos, invalid formats, and disposable domains in
            customer emails that could impact delivery notifications.
          </s-paragraph>

          <div style={{ marginTop: 16 }}>
            <Link to="/app/email">
              <s-button>Open module</s-button>
            </Link>
          </div>
        </s-section>



        <s-section heading="📊 Store Insights">
          <s-paragraph>
            Understand where your customers are buying and what products
            perform best in each region.
          </s-paragraph>

          <div style={{ marginTop: 16 }}>
            <Link to="/app/insights">
              <s-button>Open module</s-button>
            </Link>
          </div>
        </s-section>


      </div>
    </s-page>
  );
}