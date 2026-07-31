import React from "react";

export interface OrderFilterValues {
  lastDays?: number;
  limit: number;
}

interface OrderFiltersProps {
  values: OrderFilterValues;
  onChange: (
    values: OrderFilterValues
  ) => void;
}

const selectStyle = {
  marginLeft: 6,
  padding: "5px 8px",
  borderRadius: 14,
  border: "1px solid #c9cccf",
  backgroundColor: "#ffffff",
  fontSize: 10,
  cursor: "pointer",
  height: 30,
};


export default function OrderFilters({
  values,
  onChange,
}: OrderFiltersProps) {

  return (

    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >

      <label
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#202223",
        }}
      >

        Time range:

        <select

          value={
            values.lastDays ?? "all"
          }

          onChange={(e) => {

            const value =
              e.target.value;

            onChange({

              ...values,

              lastDays:
                value === "all"
                  ? undefined
                  : Number(value),

            });

          }}

          style={selectStyle}

        >

          <option value="all">
            All time
          </option>

          <option value="7">
            Last 7 days
          </option>

          <option value="30">
            Last 30 days
          </option>

          <option value="90">
            Last 90 days
          </option>

          <option value="365">
            Last year
          </option>

        </select>

      </label>



      <label
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#202223",
        }}
      >

        Order limit:

        <select

          value={values.limit}

          onChange={(e) => {

            onChange({

              ...values,

              limit:
                Number(
                  e.target.value
                ),

            });

          }}

          style={selectStyle}

        >

          <option value={1000000}>
            All orders
          </option>

          <option value={100}>
            100 orders
          </option>

          <option value={250}>
            250 orders
          </option>

          <option value={1000}>
            1,000 orders
          </option>

          <option value={5000}>
            5,000 orders
          </option>

          <option value={10000}>
            10,000 orders
          </option>

        </select>

      </label>


    </div>

  );

}